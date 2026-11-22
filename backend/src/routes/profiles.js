// Hồ sơ cá nhân (FR-PRO-*) – phụ trách: Khang (doqin).
//
// Đổi ảnh đại diện theo luồng 3 bước (SRS 3.5), ảnh KHÔNG đi qua Express (giới hạn body 4,5 MB của Vercel):
//   1. POST /api/profiles/me/avatar-url  { mime_type, file_size }
//      → 201 { path, token, signed_url, content_type }
//   2. Client nén ảnh ≤ 1 MB rồi tải thẳng lên Storage, bọc Blob với `content_type` ở bước 1:
//        supabase.storage.from('images').uploadToSignedUrl(path, token, blob)
//   3. POST /api/profiles/me/avatar  { path }
//      Express kiểm tra ảnh thật (kích thước, MIME, magic bytes), sai thì xóa; đúng thì ghi `avatar_url`
//      và xóa ảnh cũ → 200 <hồ sơ>
// Express không lưu gì giữa bước 1 và 3: đường dẫn `avatars/<user_id>/<uuid>.<loại>` tự cho biết chủ ảnh.
import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { HEAD_BYTES } from '../lib/files.js';
import {
  IMAGES_BUCKET, buildAvatarPath, checkDeclaredAvatar, checkStoredAvatar, parseAvatarPath, signAvatar,
} from '../lib/avatar.js';
import { hydratePosts } from '../lib/posts.js';
import { validate } from '../middleware/validate.js';
import { uploadLimiter } from '../middleware/rateLimit.js';

// Ô văn bản không bắt buộc: client gửi '' hoặc null để xóa → lưu null.
const optionalText = (label, max) => z.string().trim().max(max, `${label} tối đa ${max} ký tự`).nullish()
  .transform((v) => (v === undefined ? undefined : v || null));

// `.strict()`: trường lạ (đặc biệt `role`, `is_locked`) bị từ chối thay vì lặng lẽ bỏ qua (FR-PRO-02).
const profileSchema = z.strictObject({
  full_name: z.string().trim().min(2, 'Họ tên tối thiểu 2 ký tự').max(100, 'Họ tên tối đa 100 ký tự').optional(),
  bio: optionalText('Giới thiệu', 500),
  major: optionalText('Ngành', 100),
  school: optionalText('Trường', 150),
  year: z.number().int('Năm học không hợp lệ').min(1, 'Năm học từ 1 đến 8').max(8, 'Năm học từ 1 đến 8').nullish(),
}).refine((b) => Object.keys(b).length > 0, { message: 'Không có thông tin nào để sửa' });

const avatarUrlSchema = z.object({
  mime_type: z.string().max(255),
  file_size: z.number().int(),
});

const avatarConfirmSchema = z.object({ path: z.string().max(255) });

const idParam = z.object({ id: z.uuid('Hồ sơ không hợp lệ') });
const postsQuery = z.object({ page: z.coerce.number().int().min(1).max(1000).default(1) });

const POSTS_PER_PAGE = 10;

// Hồ sơ công khai (FR-PRO-01): mọi sinh viên đã đăng nhập xem được (SRS 4). Không có email, role, is_locked.
const PUBLIC_FIELDS = 'id, full_name, avatar_url, bio, major, school, year, created_at';

/** Đếm dòng của một bảng theo một điều kiện bằng, không tải dữ liệu về. */
async function countWhere(sb, table, column, value) {
  const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true }).eq(column, value);
  if (error) throw error;
  return count ?? 0;
}

/** Đọc vài byte đầu của ảnh trên Storage qua signed URL ngắn hạn (không tải cả ảnh vào bộ nhớ). */
async function readHeadFromStorage(sb, path) {
  const { data, error } = await sb.storage.from(IMAGES_BUCKET).createSignedUrl(path, 60);
  if (error) throw error;
  const res = await fetch(data.signedUrl, { headers: { Range: `bytes=0-${HEAD_BYTES - 1}` } });
  if (!res.ok) throw new Error(`Không đọc được ảnh (${res.status})`);
  const reader = res.body.getReader();
  const chunks = [];
  let len = 0;
  while (len < HEAD_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    len += value.length;
  }
  await reader.cancel().catch(() => {});
  return Buffer.concat(chunks).subarray(0, HEAD_BYTES);
}

/**
 * @param {object} [deps] thay thế khi test (Supabase giả).
 * @param {() => any} [deps.db] trả về client Supabase service_role.
 * @param {(sb: any, path: string) => Promise<Uint8Array>} [deps.readHead]
 */
export function createProfilesRouter({ db = supabaseAdmin, readHead = readHeadFromStorage } = {}) {
  const r = Router();

  // Sửa thông tin hồ sơ của chính mình. Chỉ các trường trong whitelist được ghi; role/is_locked không bao giờ.
  r.patch('/me', validate({ body: profileSchema }), async (req, res, next) => {
    try {
      const sb = db();
      const { data, error } = await sb.from('profiles').update(req.body).eq('id', req.user.id).select().single();
      if (error) throw error;
      res.json(await signAvatar(sb, data));
    } catch (e) {
      next(e);
    }
  });

  // Bước 1: cấp signed upload URL cho ảnh đại diện.
  r.post('/me/avatar-url', uploadLimiter, validate({ body: avatarUrlSchema }), async (req, res, next) => {
    try {
      const check = checkDeclaredAvatar({ mimeType: req.body.mime_type, size: req.body.file_size });
      if (!check.ok) throw badRequest(check.error);

      const path = buildAvatarPath(req.user.id, check.type);
      const { data, error } = await db().storage.from(IMAGES_BUCKET).createSignedUploadUrl(path);
      if (error) throw error;
      res.status(201).json({ path: data.path, token: data.token, signed_url: data.signedUrl, content_type: check.mime });
    } catch (e) {
      next(e);
    }
  });

  // Bước 3: xác nhận ảnh đã tải lên và gán làm ảnh đại diện.
  r.post('/me/avatar', validate({ body: avatarConfirmSchema }), async (req, res, next) => {
    try {
      const { path } = req.body;
      const parsed = parseAvatarPath(path);
      if (!parsed) throw badRequest('Đường dẫn ảnh không hợp lệ');
      if (parsed.userId !== req.user.id) throw forbidden('Ảnh không thuộc về bạn');

      const sb = db();
      const bucket = sb.storage.from(IMAGES_BUCKET);
      const discard = async (err) => {
        await bucket.remove([path]).catch(() => {});
        throw err;
      };

      const { data: info, error: infoErr } = await bucket.info(path);
      if (infoErr || !info) throw badRequest('Chưa thấy ảnh trên kho lưu trữ, hãy tải lên trước');

      const head = await readHead(sb, path);
      const fileError = checkStoredAvatar(parsed.type, { size: info.size, contentType: info.contentType, head });
      if (fileError) await discard(badRequest(fileError));

      const old = req.profile?.avatar_url;
      const { data, error } = await sb.from('profiles').update({ avatar_url: path }).eq('id', req.user.id)
        .select().single();
      if (error) await discard(error);

      // Dọn ảnh cũ sau khi đã ghi hồ sơ; lỗi dọn không làm hỏng yêu cầu.
      if (old && old !== path && parseAvatarPath(old)?.userId === req.user.id) {
        await bucket.remove([old]).catch(() => {});
      }
      res.json(await signAvatar(sb, data));
    } catch (e) {
      next(e);
    }
  });

  // FR-PRO-01: xem hồ sơ của bất kỳ người dùng nào kèm số người theo dõi / đang theo dõi.
  r.get('/:id', validate({ params: idParam }), async (req, res, next) => {
    try {
      const sb = db();
      const { data: profile, error } = await sb.from('profiles').select(PUBLIC_FIELDS).eq('id', req.params.id).maybeSingle();
      if (error) throw error;
      if (!profile) throw notFound('Không tìm thấy người dùng');

      const [followers, following] = await Promise.all([
        countWhere(sb, 'follows', 'followee_id', profile.id),
        countWhere(sb, 'follows', 'follower_id', profile.id),
      ]);
      const signed = await signAvatar(sb, profile);
      res.json({ ...signed, followers_count: followers, following_count: following, is_self: profile.id === req.user.id });
    } catch (e) {
      next(e);
    }
  });

  // FR-PRO-03: bài đăng của người đó, mới nhất trước, phân trang → { items, page, has_more }.
  // Bài cá nhân thấy được với mọi người; bài nhóm chỉ khi người xem là thành viên đã duyệt của nhóm (SRS 4).
  r.get('/:id/posts', validate({ params: idParam, query: postsQuery }), async (req, res, next) => {
    try {
      const sb = db();
      const { id } = req.params;
      const page = Number(req.query.page ?? 1);

      const { data: exists, error: exErr } = await sb.from('profiles').select('id').eq('id', id).maybeSingle();
      if (exErr) throw exErr;
      if (!exists) throw notFound('Không tìm thấy người dùng');

      const { data: mine, error: mErr } = await sb.from('group_members').select('group_id')
        .eq('user_id', req.user.id).eq('status', 'approved');
      if (mErr) throw mErr;
      const groupIds = (mine ?? []).map((m) => m.group_id);

      let q = sb.from('posts').select('id, author_id, group_id, content, image_urls, created_at').eq('author_id', id);
      q = groupIds.length ? q.or(`group_id.is.null,group_id.in.(${groupIds.join(',')})`) : q.is('group_id', null);
      const from = (page - 1) * POSTS_PER_PAGE;
      // Lấy dư một bài để biết còn trang sau; `id` phân định khi hai bài cùng thời điểm.
      const { data: rows, error } = await q.order('created_at', { ascending: false }).order('id', { ascending: false })
        .range(from, from + POSTS_PER_PAGE);
      if (error) throw error;

      const hasMore = (rows ?? []).length > POSTS_PER_PAGE;
      const posts = (rows ?? []).slice(0, POSTS_PER_PAGE);
      if (!posts.length) return res.json({ items: [], page, has_more: false });

      // Dạng bài đăng dùng chung với bảng tin (lib/posts.js); hồ sơ không cần `author` và đường dẫn gốc của ảnh.
      const items = (await hydratePosts(sb, posts, req.user.id)).map(({ author, image_paths, ...p }) => p);
      res.json({
        items,
        page,
        has_more: hasMore,
      });
    } catch (e) {
      next(e);
    }
  });

  return r;
}

export default createProfilesRouter();
