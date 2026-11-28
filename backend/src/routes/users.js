// Tìm và gợi ý người dùng theo tên (FR-SOC-06) – phụ trách: Minh Trọng (minhtrong2921).
//
// Hợp đồng API:
//   - GET /api/users?q=<tên>&page=1&limit=20
//       Có `q`  → tìm theo tên, không dấu (hàm search_users, migration 0007).
//       Không q → gợi ý người người gọi chưa theo dõi, ưu tiên người đang theo dõi mình,
//                 được người mình theo dõi theo dõi, cùng ngành, cùng trường (hàm suggest_users).
//     Trả về { items: [{ id, full_name, avatar_url, bio, major, school, year,
//                        is_following, is_followed_by, is_mutual,
//                        reason?: { follows_me, mutual_count, same_major, same_school } }], page, has_more }.
//     `reason` chỉ có ở chế độ gợi ý.
//     Luôn bỏ chính người gọi và tài khoản bị khóa.
import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { signAvatars } from '../lib/posts.js';
import { validate } from '../middleware/validate.js';

const PUBLIC_USER_FIELDS = 'id, full_name, avatar_url, bio, major, school, year';
const SUGGEST_FOLLOWING_CAP = 500; // số người đang theo dõi tối đa đưa vào bộ lọc gợi ý

const querySchema = z.object({
  q: z.string().trim().max(100, 'Từ khóa tối đa 100 ký tự').optional().default(''),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** Lỗi do DB chưa có hàm RPC (chưa áp migration 0007) → dùng đường dự phòng. */
const isMissingFn = (error) => error.code === 'PGRST202' || error.code === '42883';

/** Escape ký tự đặc biệt của LIKE để từ khóa được hiểu theo nghĩa đen. */
const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Lấy limit+1 dòng khớp tên. Dùng search_users (không dấu); DB chưa có hàm thì dùng ilike. */
async function searchByName(sb, viewerId, q, from, limit) {
  const { data, error } = await sb.rpc('search_users', {
    p_q: q, p_exclude: viewerId, p_limit: limit + 1, p_offset: from,
  });
  if (!error) return data ?? [];
  if (!isMissingFn(error)) throw error;

  const { data: rows, error: e2 } = await sb
    .from('profiles')
    .select(PUBLIC_USER_FIELDS)
    .ilike('full_name', `%${escapeLike(q)}%`)
    .eq('is_locked', false)
    .neq('id', viewerId)
    .order('full_name', { ascending: true })
    .order('id', { ascending: true })
    .range(from, from + limit);
  if (e2) throw e2;
  return rows ?? [];
}

/**
 * Gợi ý: người viewer chưa theo dõi, xếp theo điểm ưu tiên (hàm suggest_users, migration 0007),
 * kèm lý do gợi ý. DB chưa có hàm thì dùng bản đơn giản (mới tham gia trước, không lý do).
 */
async function suggest(sb, viewerId, from, limit) {
  const { data, error } = await sb.rpc('suggest_users', { p_viewer: viewerId, p_limit: limit + 1, p_offset: from });
  if (!error) {
    return (data ?? []).map(({ follows_me, mutual_count, same_major, same_school, ...u }) => ({
      ...u,
      reason: { follows_me, mutual_count, same_major, same_school },
    }));
  }
  if (!isMissingFn(error)) throw error;
  return suggestFallback(sb, viewerId, from, limit);
}

/** Bản tạm khi chưa áp migration 0007: loại người đã theo dõi bằng danh sách id (giới hạn SUGGEST_FOLLOWING_CAP). */
async function suggestFallback(sb, viewerId, from, limit) {
  const { data: following, error: fErr } = await sb
    .from('follows')
    .select('followee_id')
    .eq('follower_id', viewerId)
    .limit(SUGGEST_FOLLOWING_CAP);
  if (fErr) throw fErr;
  const exclude = [viewerId, ...(following ?? []).map((r) => r.followee_id)];

  const { data, error } = await sb
    .from('profiles')
    .select(PUBLIC_USER_FIELDS)
    .eq('is_locked', false)
    .not('id', 'in', `(${exclude.join(',')})`)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .range(from, from + limit);
  if (error) throw error;
  return data ?? [];
}

/** Gắn trạng thái theo dõi/Mutual của viewer với từng người trong danh sách. */
async function withFollowState(sb, viewerId, users) {
  if (!users.length) return [];
  const ids = users.map((u) => u.id);
  const [mine, theirs, signed] = await Promise.all([
    sb.from('follows').select('followee_id').eq('follower_id', viewerId).in('followee_id', ids),
    sb.from('follows').select('follower_id').eq('followee_id', viewerId).in('follower_id', ids),
    signAvatars(sb, users),
  ]);
  if (mine.error) throw mine.error;
  if (theirs.error) throw theirs.error;
  const following = new Set((mine.data ?? []).map((r) => r.followee_id));
  const followedBy = new Set((theirs.data ?? []).map((r) => r.follower_id));
  return signed.map((u) => {
    const isFollowing = following.has(u.id);
    const isFollowedBy = followedBy.has(u.id);
    return { ...u, is_following: isFollowing, is_followed_by: isFollowedBy, is_mutual: isFollowing && isFollowedBy };
  });
}

/**
 * @param {object} [deps] thay thế khi test (Supabase giả).
 * @param {() => any} [deps.db] trả về client Supabase service_role.
 */
export function createUsersRouter({ db = supabaseAdmin } = {}) {
  const r = Router();

  r.get('/', validate({ query: querySchema }), async (req, res, next) => {
    try {
      const sb = db();
      const q = String(req.query.q ?? '').trim();
      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 20);
      const from = (page - 1) * limit;

      const rows = q
        ? await searchByName(sb, req.user.id, q, from, limit)
        : await suggest(sb, req.user.id, from, limit);

      const hasMore = rows.length > limit;
      const items = await withFollowState(sb, req.user.id, rows.slice(0, limit));
      res.json({ items, page, has_more: hasMore });
    } catch (e) {
      next(e);
    }
  });

  return r;
}

export default createUsersRouter();
