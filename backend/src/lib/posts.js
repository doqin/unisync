// Tiện ích dùng chung cho bài đăng, bình luận và phân trang cursor (FR-SOC-01..04).
// Chuẩn hóa dạng bài đăng trả về (khớp PR #71 của hồ sơ):
//   { id, author_id, group_id, content, image_urls (signed URL), image_paths (đường dẫn gốc),
//     created_at, author: { id, full_name, avatar_url }, group: { id, name } | null,
//     like_count, comment_count, liked_by_me }
import { badRequest, forbidden, notFound } from './errors.js';
import { canAccessGroup, isAdmin } from './permissions.js';
import { AVATAR_VIEW_TTL, IMAGES_BUCKET, parseAvatarPath } from './avatar.js';
import { signPostImages } from './postImages.js';

export const POST_SELECT = 'id, author_id, group_id, content, image_urls, created_at';
export const COMMENT_SELECT = 'id, post_id, author_id, parent_id, content, created_at';
export const AUTHOR_SELECT = 'id, full_name, avatar_url';

export const DEFAULT_FEED_LIMIT = 10;
export const MAX_FEED_LIMIT = 50;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?)(Z|[+-]\d{2}:?\d{2})$/i;

/** Chuẩn hóa mốc thời gian ISO về dạng UTC kết thúc bằng `Z`, giữ nguyên độ chính xác micro giây của Postgres. */
function normalizeUtcIso(raw) {
  const m = ISO_RE.exec(raw);
  if (!m) return null;
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return null;
  const [, body, tz] = m;
  if (/^(Z|[+-]00:?00)$/i.test(tz)) return `${body}Z`;
  return new Date(ms).toISOString();
}

/** Tạo con trỏ phân trang từ bài cuối cùng: `<iso_utc>|<uuid>`. */
export function encodeCursor(post) {
  const iso = normalizeUtcIso(String(post.created_at)) ?? new Date(post.created_at).toISOString();
  return `${iso}|${post.id}`;
}

/**
 * Giải mã con trỏ phân trang. Chấp nhận cả `<iso>|<uuid>` và `<iso>` thuần.
 * Chỉ chấp nhận chuỗi ISO hợp lệ để không bao giờ chèn ký tự lạ vào bộ lọc `.or()` của PostgREST.
 * @returns {{ createdAt: string, id: string | null } | null}
 */
export function decodeCursor(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const parts = raw.trim().split('|');
  if (parts.length > 2) return null;
  const [tsRaw, idRaw] = parts;
  const createdAt = normalizeUtcIso(tsRaw);
  if (!createdAt) return null;
  if (parts.length === 2 && !UUID_RE.test(idRaw)) return null;
  return { createdAt, id: idRaw ?? null };
}

/** Áp dụng lọc cursor theo `(created_at DESC, id DESC)` lên truy vấn PostgREST. */
export function applyCursorFilter(query, cursorRaw) {
  if (!cursorRaw) return query;
  const cursor = decodeCursor(cursorRaw);
  if (!cursor) throw badRequest('Con trỏ phân trang không hợp lệ');
  if (cursor.id) {
    return query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
  }
  return query.lt('created_at', cursor.createdAt);
}

/** Đếm số dòng theo `post_id` cho một tập bài đăng: Map<post_id, số lượng>. */
async function countByPost(sb, table, postIds) {
  const { data, error } = await sb.from(table).select('post_id').in('post_id', postIds);
  if (error) throw error;
  const map = new Map();
  for (const row of data ?? []) map.set(row.post_id, (map.get(row.post_id) ?? 0) + 1);
  return map;
}

/**
 * Ký hàng loạt ảnh đại diện cho danh sách hồ sơ trong 1 lần gọi Storage (tránh N+1 `createSignedUrl`).
 * Đường dẫn không hợp lệ hoặc lỗi ký → `avatar_url: null`, không làm hỏng yêu cầu.
 */
export async function signAvatars(sb, profiles) {
  if (!profiles.length) return [];
  const paths = [...new Set(profiles.map((p) => p.avatar_url).filter((u) => parseAvatarPath(u)))];
  let signedMap = new Map();
  if (paths.length) {
    const { data, error } = await sb.storage.from(IMAGES_BUCKET).createSignedUrls(paths, AVATAR_VIEW_TTL);
    if (!error) {
      signedMap = new Map((data ?? []).filter((d) => d.signedUrl && !d.error).map((d) => [d.path, d.signedUrl]));
    }
  }
  return profiles.map((p) => ({
    ...p,
    avatar_url: p.avatar_url && parseAvatarPath(p.avatar_url) ? (signedMap.get(p.avatar_url) ?? null) : null,
  }));
}

/** Nạp hồ sơ tác giả (chỉ trường công khai) và ký hàng loạt signed URL ảnh đại diện. */
export async function loadSignedAuthors(sb, authorIds) {
  const uniqueIds = [...new Set(authorIds.filter(Boolean))];
  if (!uniqueIds.length) return new Map();
  const { data: profiles, error } = await sb.from('profiles').select(AUTHOR_SELECT).in('id', uniqueIds);
  if (error) throw error;
  const signed = await signAvatars(sb, profiles ?? []);
  return new Map(signed.map((p) => [p.id, p]));
}

/** Tải bài đăng theo id; ném 404 nếu không tồn tại. */
export async function loadPost(sb, postId) {
  const { data, error } = await sb.from('posts').select(POST_SELECT).eq('id', postId).maybeSingle();
  if (error) throw error;
  if (!data) throw notFound('Không tìm thấy bài đăng');
  return data;
}

/** Kiểm tra nhóm tồn tại và người dùng có quyền truy cập nhóm (thành viên đã duyệt hoặc Admin). */
export async function assertGroupAccess(sb, groupId, userId, profile, message) {
  const { data: group, error: gErr } = await sb.from('groups').select('id, name').eq('id', groupId).maybeSingle();
  if (gErr) throw gErr;
  if (!group) throw notFound('Không tìm thấy nhóm');

  if (isAdmin(profile)) return group;

  const { data: membership, error: mErr } = await sb
    .from('group_members')
    .select('status, role')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();
  if (mErr) throw mErr;
  if (!canAccessGroup(profile, membership)) {
    throw forbidden(message ?? 'Chỉ thành viên đã được duyệt của nhóm mới có quyền truy cập');
  }
  return group;
}

/** Kiểm tra người dùng có quyền xem/tương tác với bài đăng hay không (bài nhóm yêu cầu thành viên đã duyệt). */
export async function assertPostAccess(sb, post, userId, profile) {
  if (!post.group_id) return;
  if (isAdmin(profile)) return;
  const { data: membership, error } = await sb
    .from('group_members')
    .select('status, role')
    .eq('group_id', post.group_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!canAccessGroup(profile, membership)) {
    throw forbidden('Chỉ thành viên đã được duyệt của nhóm mới xem được bài đăng này');
  }
}

/** Tải thống kê cảm xúc (6 loại, mặc định 'love' nếu dữ liệu cũ chưa có giá trị) cho một tập bài đăng. */
async function loadPostReactionsSummary(sb, postIds, viewerId) {
  const { data, error } = await sb
    .from('likes')
    .select('post_id, user_id, reaction')
    .in('post_id', postIds);
  if (error) throw error;

  const totals = new Map();
  const counts = new Map();
  const mine = new Map();
  for (const row of data ?? []) {
    totals.set(row.post_id, (totals.get(row.post_id) ?? 0) + 1);
    const type = row.reaction || 'love';
    const byType = counts.get(row.post_id) ?? {};
    byType[type] = (byType[type] ?? 0) + 1;
    counts.set(row.post_id, byType);
    if (viewerId && row.user_id === viewerId) mine.set(row.post_id, type);
  }
  return { totals, counts, mine };
}

/**
 * Gắn đầy đủ thông tin hiển thị cho danh sách bài đăng: tác giả (avatar đã ký), ảnh bài đăng (đã ký),
 * tên nhóm, số lượt thích/cảm xúc, số bình luận, trạng thái `liked_by_me` và `my_reaction`.
 */
export async function hydratePosts(sb, posts, viewerId) {
  if (!posts.length) return [];
  const postIds = posts.map((p) => p.id);
  const authorIds = posts.map((p) => p.author_id);
  const groupIds = [...new Set(posts.map((p) => p.group_id).filter(Boolean))];

  const [reactions, commentCounts, authorMap, groupRes, signedImages] = await Promise.all([
    loadPostReactionsSummary(sb, postIds, viewerId),
    countByPost(sb, 'comments', postIds),
    loadSignedAuthors(sb, authorIds),
    groupIds.length ? sb.from('groups').select('id, name').in('id', groupIds) : { data: [], error: null },
    signPostImages(sb, posts),
  ]);
  if (groupRes.error) throw groupRes.error;

  const groupName = new Map((groupRes.data ?? []).map((g) => [g.id, g.name]));

  return posts.map((p) => {
    const rawPaths = p.image_urls ?? [];
    const paired = rawPaths
      .map((path) => ({ path, url: signedImages.get(path) }))
      .filter((x) => Boolean(x.url));
    const isAuthor = p.author_id === viewerId;
    const myReaction = reactions.mine.get(p.id) ?? null;
    return {
      ...p,
      // Chỉ trả đường dẫn gốc (chứa user_id) cho chính tác giả để phục vụ sửa bài, tránh lộ cho người xem khác.
      ...(isAuthor ? { image_paths: paired.map((x) => x.path) } : {}),
      image_urls: paired.map((x) => x.url),
      author: authorMap.get(p.author_id) ?? null,
      group: p.group_id ? { id: p.group_id, name: groupName.get(p.group_id) ?? null } : null,
      like_count: reactions.totals.get(p.id) ?? 0,
      reaction_counts: reactions.counts.get(p.id) ?? {},
      comment_count: commentCounts.get(p.id) ?? 0,
      liked_by_me: Boolean(myReaction),
      my_reaction: myReaction,
    };
  });
}

/** Gắn thông tin tác giả (avatar đã ký) và thống kê cảm xúc cho danh sách bình luận. */
export async function hydrateComments(sb, comments, viewerId = null) {
  if (!comments.length) return [];
  const commentIds = comments.map((c) => c.id);

  const [authorMap, reactionsRes] = await Promise.all([
    loadSignedAuthors(sb, comments.map((c) => c.author_id)),
    sb.from('comment_reactions').select('comment_id, user_id, reaction').in('comment_id', commentIds),
  ]);
  if (reactionsRes.error) throw reactionsRes.error;

  const countsMap = new Map();
  const totalsMap = new Map();
  const mineMap = new Map();
  for (const r of reactionsRes.data ?? []) {
    totalsMap.set(r.comment_id, (totalsMap.get(r.comment_id) ?? 0) + 1);
    const byType = countsMap.get(r.comment_id) ?? {};
    byType[r.reaction] = (byType[r.reaction] ?? 0) + 1;
    countsMap.set(r.comment_id, byType);
    if (viewerId && r.user_id === viewerId) mineMap.set(r.comment_id, r.reaction);
  }

  return comments.map((c) => ({
    ...c,
    parent_id: c.parent_id ?? null,
    author: authorMap.get(c.author_id) ?? null,
    reaction_count: totalsMap.get(c.id) ?? 0,
    reaction_counts: countsMap.get(c.id) ?? {},
    my_reaction: mineMap.get(c.id) ?? null,
  }));
}
