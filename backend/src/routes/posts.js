// Bài đăng, bình luận và thích bài đăng (FR-SOC-01, FR-SOC-03, FR-SOC-04) – phụ trách: Đức Huy (dhuyy-06).
//
// Hợp đồng API:
//   - POST   /api/posts/upload-url            Cấp signed upload URL cho ảnh bài đăng (bucket `images`, ≤ 1 MB)
//   - GET    /api/posts                       Danh sách bài đăng (lọc `group_id`/`author_id`, hoặc bài cá nhân công khai; trang chủ dùng `/api/feed`)
//   - POST   /api/posts                       Tạo bài đăng (văn bản 1–5000 ký tự, 0–4 ảnh đã tải lên)
//   - GET    /api/posts/:id                   Chi tiết bài đăng kèm tác giả, số thích/bình luận, ảnh đã ký
//   - PATCH  /api/posts/:id                   Sửa bài đăng (chỉ tác giả)
//   - DELETE /api/posts/:id                   Xóa bài đăng (tác giả hoặc Admin) và dọn ảnh trên Storage
//   - POST   /api/posts/:id/like              Thích bài đăng (idempotent) → { post_id, liked_by_me: true, like_count }
//   - DELETE /api/posts/:id/like              Bỏ thích bài đăng → { post_id, liked_by_me: false, like_count }
//   - GET    /api/posts/:id/comments                    Danh sách bình luận (?page=1&limit=20)
//   - POST   /api/posts/:id/comments                    Thêm bình luận / phản hồi (1–2000 ký tự, parent_id?)
//   - PATCH  /api/posts/:id/comments/:cid               Sửa bình luận (chỉ tác giả bình luận)
//   - DELETE /api/posts/:id/comments/:cid               Xóa bình luận (tác giả bình luận hoặc Admin)
//   - PUT    /api/posts/:id/comments/:cid/reaction      Thả / đổi cảm xúc bình luận
//   - DELETE /api/posts/:id/comments/:cid/reaction      Bỏ cảm xúc bình luận
import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { badRequest, forbidden, HttpError, notFound } from '../lib/errors.js';
import { isAdmin } from '../lib/permissions.js';
import {
  IMAGES_BUCKET,
  MAX_POST_IMAGES,
  buildPostImagePath,
  checkDeclaredPostImage,
  checkStoredPostImage,
  checkStoredPostImageMeta,
  parsePostImagePath,
  readImageHeadFromStorage,
} from '../lib/postImages.js';
import {
  COMMENT_SELECT,
  DEFAULT_FEED_LIMIT,
  MAX_FEED_LIMIT,
  POST_SELECT,
  applyCursorFilter,
  assertGroupAccess,
  assertPostAccess,
  encodeCursor,
  hydrateComments,
  hydratePosts,
  loadPost,
} from '../lib/posts.js';
import { validate } from '../middleware/validate.js';
import { uploadLimiter } from '../middleware/rateLimit.js';

const postIdParam = z.object({ id: z.uuid('Bài đăng không hợp lệ') });

const commentParams = z.object({
  id: z.uuid('Bài đăng không hợp lệ'),
  commentId: z.uuid('Bình luận không hợp lệ'),
});

const uploadUrlSchema = z.object({
  mime_type: z.string().max(255),
  file_size: z.number().int(),
});

const imageUrlsField = z
  .array(z.string().max(255))
  .max(MAX_POST_IMAGES, `Tối đa ${MAX_POST_IMAGES} ảnh cho mỗi bài đăng`);

const contentField = z
  .string()
  .trim()
  .min(1, 'Nội dung bài đăng không được trống')
  .max(5000, 'Nội dung bài đăng tối đa 5000 ký tự');

const createPostSchema = z.strictObject({
  content: contentField,
  group_id: z.uuid('Nhóm không hợp lệ').nullish().transform((v) => v ?? null),
  image_urls: imageUrlsField.default([]),
});

const updatePostSchema = z
  .strictObject({
    content: contentField.optional(),
    image_urls: imageUrlsField.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Không có thông tin nào để sửa' });

const listPostsQuerySchema = z.object({
  group_id: z.uuid('Nhóm không hợp lệ').optional(),
  author_id: z.uuid('Người dùng không hợp lệ').optional(),
  cursor: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_FEED_LIMIT).default(DEFAULT_FEED_LIMIT),
});

const commentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const commentContentField = z
  .string()
  .trim()
  .min(1, 'Nội dung bình luận không được trống')
  .max(2000, 'Bình luận tối đa 2000 ký tự');

const createCommentSchema = z.strictObject({
  content: commentContentField,
  parent_id: z.uuid('Bình luận cha không hợp lệ').nullish().transform((v) => v ?? null),
});

const updateCommentSchema = z.strictObject({
  content: commentContentField,
});

const REACTION_TYPES = ['like', 'love', 'haha', 'wow', 'sad', 'angry'];

const reactionSchema = z.strictObject({
  reaction: z.enum(REACTION_TYPES, { message: 'Loại cảm xúc không hợp lệ' }),
});

/** Tải 1 bình luận thuộc bài đăng `postId`; ném 404 nếu không tồn tại hoặc thuộc bài khác. */
async function loadPostComment(sb, postId, commentId) {
  const { data, error } = await sb
    .from('comments')
    .select('id, post_id, author_id')
    .eq('id', commentId)
    .eq('post_id', postId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw notFound('Không tìm thấy bình luận');
  return data;
}

/** Tổng hợp số lượng từng loại cảm xúc của 1 bình luận dưới góc nhìn viewerId. */
async function summarizeCommentReactions(sb, commentId, viewerId) {
  const { data, error } = await sb
    .from('comment_reactions')
    .select('user_id, reaction')
    .eq('comment_id', commentId);
  if (error) throw error;
  const reaction_counts = {};
  let my_reaction = null;
  for (const row of data ?? []) {
    reaction_counts[row.reaction] = (reaction_counts[row.reaction] ?? 0) + 1;
    if (row.user_id === viewerId) my_reaction = row.reaction;
  }
  return {
    comment_id: commentId,
    my_reaction,
    reaction_count: (data ?? []).length,
    reaction_counts,
  };
}

/** Đếm số lượt thích của một bài đăng. */
async function countPostLikes(sb, postId) {
  const { count, error } = await sb
    .from('likes')
    .select('*', { count: 'exact', head: true })
    .eq('post_id', postId);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Kiểm tra danh sách đường dẫn ảnh mới: định dạng UUID, thuộc chính người gọi, chưa dùng ở bài khác,
 * tồn tại trên bucket `images` và hợp lệ về kích thước/MIME/magic bytes.
 */
async function validateNewImagePaths(sb, userId, allPaths, newPaths, excludePostId = null) {
  if (new Set(allPaths).size !== allPaths.length) {
    throw badRequest('Danh sách ảnh bị trùng lặp');
  }
  if (!newPaths.length) return [];

  const parsedList = newPaths.map((p) => {
    const parsed = parsePostImagePath(p);
    if (!parsed) throw badRequest('Đường dẫn ảnh không hợp lệ');
    if (parsed.userId !== userId) throw forbidden('Ảnh không thuộc về bạn');
    return { path: p, ...parsed };
  });

  // Kiểm tra trùng TRƯỚC khi thực hiện bất kỳ thao tác xóa nào để không bao giờ xóa ảnh của bài đã lưu.
  let overlapQ = sb.from('posts').select('id').overlaps('image_urls', newPaths);
  if (excludePostId) overlapQ = overlapQ.neq('id', excludePostId);
  const { data: conflicts, error: cErr } = await overlapQ;
  if (cErr) throw cErr;
  if ((conflicts ?? []).length > 0) {
    throw new HttpError(409, 'Ảnh này đã được gắn vào bài đăng khác');
  }

  return parsedList;
}

/** Kiểm tra tệp ảnh thật trên Storage; nếu bất kỳ ảnh nào lỗi thì xóa toàn bộ ảnh mới vừa tải lên để tránh ảnh mồ côi. */
async function verifyStoredImages(sb, readHead, parsedList) {
  if (!parsedList.length) return;
  const bucket = sb.storage.from(IMAGES_BUCKET);
  const allNewPaths = parsedList.map((i) => i.path);
  const discardAll = async (err) => {
    await bucket.remove(allNewPaths).catch(() => {});
    throw err;
  };

  for (const item of parsedList) {
    const { data: info, error: infoErr } = await bucket.info(item.path);
    if (infoErr || !info) await discardAll(badRequest('Chưa thấy ảnh trên kho lưu trữ, hãy tải lên trước'));

    // Kiểm tra kích thước + MIME trước để tránh gọi thêm HTTP đọc magic bytes nếu đã sai.
    const metaError = checkStoredPostImageMeta(item.type, {
      size: info.size,
      contentType: info.contentType,
    });
    if (metaError) await discardAll(badRequest(metaError));

    const head = await readHead(sb, item.path);
    const fileError = checkStoredPostImage(item.type, {
      size: info.size,
      contentType: info.contentType,
      head,
    });
    if (fileError) await discardAll(badRequest(fileError));
  }
}

/**
 * @param {object} [deps] thay thế khi test (Supabase giả).
 * @param {() => any} [deps.db] trả về client Supabase service_role.
 * @param {(sb: any, path: string) => Promise<Uint8Array>} [deps.readHead]
 */
export function createPostsRouter({ db = supabaseAdmin, readHead = readImageHeadFromStorage } = {}) {
  const r = Router();

  // FR-SOC-01: Bước 1–2 tải ảnh bài đăng — cấp signed upload URL vào bucket riêng tư `images`.
  r.post('/upload-url', uploadLimiter, validate({ body: uploadUrlSchema }), async (req, res, next) => {
    try {
      const check = checkDeclaredPostImage({
        mimeType: req.body.mime_type,
        size: req.body.file_size,
      });
      if (!check.ok) throw badRequest(check.error);

      const path = buildPostImagePath(req.user.id, check.type);
      const { data, error } = await db().storage.from(IMAGES_BUCKET).createSignedUploadUrl(path);
      if (error) throw error;
      res.status(201).json({
        path: data.path,
        token: data.token,
        signed_url: data.signedUrl,
        content_type: check.mime,
      });
    } catch (e) {
      next(e);
    }
  });

  // Danh sách bài đăng (hỗ trợ lọc `group_id` cho tab nhóm, `author_id` cho hồ sơ, hoặc công khai; cursor).
  r.get('/', validate({ query: listPostsQuerySchema }), async (req, res, next) => {
    try {
      const sb = db();
      const groupId = req.query.group_id;
      const authorId = req.query.author_id;
      const limit = Number(req.query.limit ?? DEFAULT_FEED_LIMIT);

      let q = sb.from('posts').select(POST_SELECT);
      if (groupId) {
        await assertGroupAccess(
          sb,
          groupId,
          req.user.id,
          req.profile,
          'Chỉ thành viên đã được duyệt của nhóm mới xem được bảng tin nhóm',
        );
        q = q.eq('group_id', groupId);
        if (authorId) q = q.eq('author_id', authorId);
      } else if (authorId) {
        q = q.eq('author_id', authorId);
        if (!isAdmin(req.profile)) {
          const { data: memberships, error: mErr } = await sb
            .from('group_members')
            .select('group_id')
            .eq('user_id', req.user.id)
            .eq('status', 'approved');
          if (mErr) throw mErr;
          const groupIds = (memberships ?? []).map((m) => m.group_id);
          q = groupIds.length
            ? q.or(`group_id.is.null,group_id.in.(${groupIds.join(',')})`)
            : q.is('group_id', null);
        }
      } else {
        q = q.is('group_id', null);
      }

      q = applyCursorFilter(q, req.query.cursor);
      const { data: rows, error } = await q
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit + 1);
      if (error) throw error;

      const list = rows ?? [];
      const hasMore = list.length > limit;
      const slice = list.slice(0, limit);
      const items = await hydratePosts(sb, slice, req.user.id);
      res.json({
        items,
        next_cursor: hasMore ? encodeCursor(slice[slice.length - 1]) : null,
        has_more: hasMore,
      });
    } catch (e) {
      next(e);
    }
  });

  // FR-SOC-01: Tạo bài đăng (cá nhân hoặc trong nhóm đã duyệt), xác nhận ảnh trên Storage nếu có.
  r.post('/', validate({ body: createPostSchema }), async (req, res, next) => {
    try {
      const sb = db();
      const { content, group_id: groupId, image_urls: imagePaths } = req.body;

      const parsedImages = await validateNewImagePaths(sb, req.user.id, imagePaths, imagePaths);

      const discardNew = async (err) => {
        if (imagePaths.length) {
          await sb.storage.from(IMAGES_BUCKET).remove(imagePaths).catch(() => {});
        }
        throw err;
      };

      if (groupId) {
        try {
          await assertGroupAccess(
            sb,
            groupId,
            req.user.id,
            req.profile,
            'Chỉ thành viên đã được duyệt của nhóm mới được đăng bài',
          );
        } catch (err) {
          await discardNew(err);
        }
      }

      await verifyStoredImages(sb, readHead, parsedImages);

      const { data: created, error } = await sb
        .from('posts')
        .insert({
          author_id: req.user.id,
          group_id: groupId,
          content,
          image_urls: imagePaths,
        })
        .select(POST_SELECT)
        .single();
      if (error) await discardNew(error);

      const [hydrated] = await hydratePosts(sb, [created], req.user.id);
      res.status(201).json(hydrated);
    } catch (e) {
      next(e);
    }
  });

  // FR-SOC-01, FR-SOC-03, FR-SOC-04: Chi tiết một bài đăng.
  r.get('/:id', validate({ params: postIdParam }), async (req, res, next) => {
    try {
      const sb = db();
      const post = await loadPost(sb, req.params.id);
      await assertPostAccess(sb, post, req.user.id, req.profile);
      const [hydrated] = await hydratePosts(sb, [post], req.user.id);
      res.json(hydrated);
    } catch (e) {
      next(e);
    }
  });

  // FR-SOC-01: Sửa bài đăng (chỉ tác giả). Hỗ trợ sửa nội dung và/hoặc danh sách ảnh.
  r.patch('/:id', validate({ params: postIdParam, body: updatePostSchema }), async (req, res, next) => {
    try {
      const sb = db();
      const post = await loadPost(sb, req.params.id);
      if (post.author_id !== req.user.id) {
        throw forbidden('Chỉ tác giả mới được sửa bài đăng này');
      }
      if (post.group_id) {
        await assertPostAccess(sb, post, req.user.id, req.profile);
      }

      const patch = {};
      if (req.body.content !== undefined) patch.content = req.body.content;

      const oldPaths = post.image_urls ?? [];
      let newPaths = [];
      let removedPaths = [];
      if (req.body.image_urls !== undefined) {
        const oldSet = new Set(oldPaths);
        newPaths = req.body.image_urls.filter((p) => !oldSet.has(p));
        const parsedNew = await validateNewImagePaths(
          sb,
          req.user.id,
          req.body.image_urls,
          newPaths,
          post.id,
        );
        await verifyStoredImages(sb, readHead, parsedNew);
        patch.image_urls = req.body.image_urls;
        const nextSet = new Set(req.body.image_urls);
        removedPaths = oldPaths.filter((p) => !nextSet.has(p) && parsePostImagePath(p)?.userId === req.user.id);
      }

      const { data: updated, error } = await sb
        .from('posts')
        .update(patch)
        .eq('id', post.id)
        .select(POST_SELECT)
        .single();
      if (error) {
        if (newPaths.length) await sb.storage.from(IMAGES_BUCKET).remove(newPaths).catch(() => {});
        throw error;
      }

      if (removedPaths.length) {
        await sb.storage.from(IMAGES_BUCKET).remove(removedPaths).catch(() => {});
      }

      const [hydrated] = await hydratePosts(sb, [updated], req.user.id);
      res.json(hydrated);
    } catch (e) {
      next(e);
    }
  });

  // FR-SOC-01: Xóa bài đăng (tác giả hoặc Admin) và dọn ảnh trong bucket `images`.
  r.delete('/:id', validate({ params: postIdParam }), async (req, res, next) => {
    try {
      const sb = db();
      const post = await loadPost(sb, req.params.id);
      if (post.author_id !== req.user.id && !isAdmin(req.profile)) {
        throw forbidden('Bạn không có quyền xóa bài đăng này');
      }

      const { error } = await sb.from('posts').delete().eq('id', post.id);
      if (error) throw error;

      const paths = (post.image_urls ?? []).filter((p) => parsePostImagePath(p));
      if (paths.length) {
        await sb.storage.from(IMAGES_BUCKET).remove(paths).catch(() => {});
      }
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  // FR-SOC-04: Thích bài đăng (idempotent: gọi lại nhiều lần không lỗi).
  r.post('/:id/like', validate({ params: postIdParam }), async (req, res, next) => {
    try {
      const sb = db();
      const post = await loadPost(sb, req.params.id);
      await assertPostAccess(sb, post, req.user.id, req.profile);

      const { error } = await sb
        .from('likes')
        .insert({ post_id: post.id, user_id: req.user.id });
      if (error && error.code !== '23505') throw error;

      const like_count = await countPostLikes(sb, post.id);
      res.json({ post_id: post.id, liked_by_me: true, like_count });
    } catch (e) {
      next(e);
    }
  });

  // FR-SOC-04: Bỏ thích bài đăng.
  r.delete('/:id/like', validate({ params: postIdParam }), async (req, res, next) => {
    try {
      const sb = db();
      const post = await loadPost(sb, req.params.id);
      await assertPostAccess(sb, post, req.user.id, req.profile);

      const { error } = await sb
        .from('likes')
        .delete()
        .eq('post_id', post.id)
        .eq('user_id', req.user.id);
      if (error) throw error;

      const like_count = await countPostLikes(sb, post.id);
      res.json({ post_id: post.id, liked_by_me: false, like_count });
    } catch (e) {
      next(e);
    }
  });

  // FR-SOC-03: Danh sách bình luận phân trang theo bình luận gốc (kèm toàn bộ phản hồi cấp 1 của từng gốc).
  r.get('/:id/comments', validate({ params: postIdParam, query: commentsQuerySchema }), async (req, res, next) => {
    try {
      const sb = db();
      const post = await loadPost(sb, req.params.id);
      await assertPostAccess(sb, post, req.user.id, req.profile);

      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 20);
      const from = (page - 1) * limit;

      const { data: rootRows, error } = await sb
        .from('comments')
        .select(COMMENT_SELECT)
        .eq('post_id', post.id)
        .is('parent_id', null)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + limit);
      if (error) throw error;

      const list = rootRows ?? [];
      const hasMore = list.length > limit;
      const roots = list.slice(0, limit);
      if (!roots.length) return res.json({ items: [], page, has_more: false });

      const rootIds = roots.map((c) => c.id);
      const { data: replyRows, error: rErr } = await sb
        .from('comments')
        .select(COMMENT_SELECT)
        .eq('post_id', post.id)
        .in('parent_id', rootIds)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });
      if (rErr) throw rErr;

      const items = await hydrateComments(sb, [...roots, ...(replyRows ?? [])], req.user.id);
      res.json({ items, page, has_more: hasMore });
    } catch (e) {
      next(e);
    }
  });

  // FR-SOC-03: Thêm bình luận hoặc phản hồi bình luận (`parent_id`) vào bài đăng (ép tối đa 2 cấp).
  r.post('/:id/comments', validate({ params: postIdParam, body: createCommentSchema }), async (req, res, next) => {
    try {
      const sb = db();
      const post = await loadPost(sb, req.params.id);
      await assertPostAccess(sb, post, req.user.id, req.profile);

      let effectiveParentId = null;
      if (req.body.parent_id) {
        const { data: parent, error: pErr } = await sb
          .from('comments')
          .select('id, parent_id')
          .eq('id', req.body.parent_id)
          .eq('post_id', post.id)
          .maybeSingle();
        if (pErr) throw pErr;
        if (!parent) throw notFound('Không tìm thấy bình luận cần trả lời');
        // Ép cây luôn đúng 2 cấp: nếu trả lời một bình luận con, quy parent_id về bình luận gốc.
        effectiveParentId = parent.parent_id ?? parent.id;
      }

      const { data: created, error } = await sb
        .from('comments')
        .insert({
          post_id: post.id,
          author_id: req.user.id,
          parent_id: effectiveParentId,
          content: req.body.content,
        })
        .select(COMMENT_SELECT)
        .single();
      if (error) throw error;

      const [hydrated] = await hydrateComments(sb, [created], req.user.id);
      res.status(201).json(hydrated);
    } catch (e) {
      next(e);
    }
  });

  // FR-SOC-03: Sửa bình luận (chỉ tác giả bình luận).
  r.patch('/:id/comments/:commentId', validate({ params: commentParams, body: updateCommentSchema }), async (req, res, next) => {
    try {
      const sb = db();
      const post = await loadPost(sb, req.params.id);
      await assertPostAccess(sb, post, req.user.id, req.profile);

      const comment = await loadPostComment(sb, post.id, req.params.commentId);
      if (comment.author_id !== req.user.id) {
        throw forbidden('Chỉ tác giả mới được sửa bình luận này');
      }

      const { data: updated, error } = await sb
        .from('comments')
        .update({ content: req.body.content })
        .eq('id', comment.id)
        .select(COMMENT_SELECT)
        .single();
      if (error) throw error;

      const [hydrated] = await hydrateComments(sb, [updated], req.user.id);
      res.json(hydrated);
    } catch (e) {
      next(e);
    }
  });

  // FR-SOC-03: Thả hoặc đổi cảm xúc cho bình luận.
  r.put('/:id/comments/:commentId/reaction', validate({ params: commentParams, body: reactionSchema }), async (req, res, next) => {
    try {
      const sb = db();
      const post = await loadPost(sb, req.params.id);
      await assertPostAccess(sb, post, req.user.id, req.profile);

      const comment = await loadPostComment(sb, post.id, req.params.commentId);
      const { error } = await sb
        .from('comment_reactions')
        .upsert(
          { comment_id: comment.id, user_id: req.user.id, reaction: req.body.reaction },
          { onConflict: 'comment_id,user_id' },
        );
      if (error) throw error;

      res.json(await summarizeCommentReactions(sb, comment.id, req.user.id));
    } catch (e) {
      next(e);
    }
  });

  // FR-SOC-03: Bỏ cảm xúc của mình khỏi bình luận.
  r.delete('/:id/comments/:commentId/reaction', validate({ params: commentParams }), async (req, res, next) => {
    try {
      const sb = db();
      const post = await loadPost(sb, req.params.id);
      await assertPostAccess(sb, post, req.user.id, req.profile);

      const comment = await loadPostComment(sb, post.id, req.params.commentId);
      const { error } = await sb
        .from('comment_reactions')
        .delete()
        .eq('comment_id', comment.id)
        .eq('user_id', req.user.id);
      if (error) throw error;

      res.json(await summarizeCommentReactions(sb, comment.id, req.user.id));
    } catch (e) {
      next(e);
    }
  });

  // FR-SOC-03: Xóa bình luận (chính chủ hoặc Admin).
  r.delete('/:id/comments/:commentId', validate({ params: commentParams }), async (req, res, next) => {
    try {
      const sb = db();
      const post = await loadPost(sb, req.params.id);
      const comment = await loadPostComment(sb, post.id, req.params.commentId);

      if (comment.author_id !== req.user.id && !isAdmin(req.profile)) {
        throw forbidden('Bạn không có quyền xóa bình luận này');
      }

      const { error } = await sb.from('comments').delete().eq('id', comment.id);
      if (error) throw error;
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  return r;
}

export default createPostsRouter();
