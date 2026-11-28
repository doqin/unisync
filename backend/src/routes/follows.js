// Theo dõi / bỏ theo dõi người dùng và nhãn Mutual (FR-SOC-05) – phụ trách: Đức Huy (dhuyy-06).
//
// Hợp đồng API:
//   - POST   /api/follows/:userId            Theo dõi người dùng (idempotent) → trạng thái quan hệ & số đếm
//   - DELETE /api/follows/:userId            Bỏ theo dõi người dùng → trạng thái quan hệ & số đếm
//   - GET    /api/follows/mutuals            Danh sách người dùng theo dõi lẫn nhau với người gọi (?q=&limit=50)
//   - GET    /api/follows/:userId/status     Trạng thái quan hệ với userId (`is_following`, `is_followed_by`, `is_mutual`)
//   - GET    /api/follows/:userId/followers  Danh sách người theo dõi userId (?page=1&limit=20)
//   - GET    /api/follows/:userId/following  Danh sách người mà userId đang theo dõi (?page=1&limit=20)
import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { badRequest, notFound } from '../lib/errors.js';
import { signAvatars } from '../lib/posts.js';
import { validate } from '../middleware/validate.js';

const userIdParam = z.object({ userId: z.uuid('Người dùng không hợp lệ') });

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const mutualsQuerySchema = z.object({
  q: z.string().trim().max(100, 'Từ khóa tối đa 100 ký tự').optional().default(''),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const PUBLIC_USER_FIELDS = 'id, full_name, avatar_url, bio, major, school, year';

const normalizeVi = (s) => String(s ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .toLowerCase()
  .trim();

/** Kiểm tra người dùng tồn tại trong bảng profiles; ném 404 nếu không có. */
async function assertUserExists(sb, userId) {
  const { data, error } = await sb.from('profiles').select('id').eq('id', userId).maybeSingle();
  if (error) throw error;
  if (!data) throw notFound('Không tìm thấy người dùng');
}

/** Đếm số dòng theo cột trong bảng `follows`. */
async function countFollows(sb, column, userId) {
  const { count, error } = await sb
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq(column, userId);
  if (error) throw error;
  return count ?? 0;
}

/** Kiểm tra tồn tại quan hệ một chiều follower → followee. */
async function hasFollow(sb, followerId, followeeId) {
  const { data, error } = await sb
    .from('follows')
    .select('follower_id')
    .eq('follower_id', followerId)
    .eq('followee_id', followeeId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/** Tổng hợp trạng thái theo dõi (kèm nhãn Mutual) và số lượng của targetId dưới góc nhìn viewerId. */
async function buildFollowStatus(sb, viewerId, targetId) {
  const isSelf = viewerId === targetId;
  const [followersCount, followingCount, isFollowing, isFollowedBy] = await Promise.all([
    countFollows(sb, 'followee_id', targetId),
    countFollows(sb, 'follower_id', targetId),
    isSelf ? false : hasFollow(sb, viewerId, targetId),
    isSelf ? false : hasFollow(sb, targetId, viewerId),
  ]);

  return {
    user_id: targetId,
    is_self: isSelf,
    is_following: isFollowing,
    is_followed_by: isFollowedBy,
    is_mutual: !isSelf && isFollowing && isFollowedBy,
    followers_count: followersCount,
    following_count: followingCount,
  };
}

/** Tải danh sách followers hoặc following có phân trang, ký avatar và gắn trạng thái Mutual với viewer. */
async function listFollowRelations(sb, viewerId, targetId, direction, page, limit) {
  await assertUserExists(sb, targetId);

  const filterCol = direction === 'followers' ? 'followee_id' : 'follower_id';
  const otherCol = direction === 'followers' ? 'follower_id' : 'followee_id';
  const from = (page - 1) * limit;

  const { data: rows, error } = await sb
    .from('follows')
    .select('follower_id, followee_id, created_at')
    .eq(filterCol, targetId)
    .order('created_at', { ascending: false })
    .order(otherCol, { ascending: true })
    .range(from, from + limit);
  if (error) throw error;

  const list = rows ?? [];
  const hasMore = list.length > limit;
  const slice = list.slice(0, limit);
  if (!slice.length) return { items: [], page, has_more: false };

  const otherIds = slice.map((r) => r[otherCol]);
  const [profilesRes, myFollowingRes, myFollowersRes] = await Promise.all([
    sb.from('profiles').select(PUBLIC_USER_FIELDS).in('id', otherIds),
    sb.from('follows').select('followee_id').eq('follower_id', viewerId).in('followee_id', otherIds),
    sb.from('follows').select('follower_id').eq('followee_id', viewerId).in('follower_id', otherIds),
  ]);
  if (profilesRes.error) throw profilesRes.error;
  if (myFollowingRes.error) throw myFollowingRes.error;
  if (myFollowersRes.error) throw myFollowersRes.error;

  const signedProfiles = await signAvatars(sb, profilesRes.data ?? []);
  const profileMap = new Map(signedProfiles.map((p) => [p.id, p]));
  const followingSet = new Set((myFollowingRes.data ?? []).map((r) => r.followee_id));
  const followedBySet = new Set((myFollowersRes.data ?? []).map((r) => r.follower_id));

  const items = slice
    .map((r) => {
      const uid = r[otherCol];
      const profile = profileMap.get(uid);
      if (!profile) return null;
      const isSelf = uid === viewerId;
      const isFollowing = !isSelf && followingSet.has(uid);
      const isFollowedBy = !isSelf && followedBySet.has(uid);
      return {
        ...profile,
        followed_at: r.created_at,
        is_self: isSelf,
        is_following: isFollowing,
        is_followed_by: isFollowedBy,
        is_mutual: isFollowing && isFollowedBy,
      };
    })
    .filter(Boolean);

  return { items, page, has_more: hasMore };
}

/** Liệt kê người dùng có quan hệ Mutual với viewerId (dùng cho gợi ý @mention khi bình luận). */
async function listMutuals(sb, viewerId, q, limit) {
  const [followingRes, followersRes] = await Promise.all([
    sb.from('follows').select('followee_id').eq('follower_id', viewerId),
    sb.from('follows').select('follower_id').eq('followee_id', viewerId),
  ]);
  if (followingRes.error) throw followingRes.error;
  if (followersRes.error) throw followersRes.error;

  const followerSet = new Set((followersRes.data ?? []).map((r) => r.follower_id));
  const mutualIds = [...new Set((followingRes.data ?? []).map((r) => r.followee_id))]
    .filter((uid) => uid !== viewerId && followerSet.has(uid));
  if (!mutualIds.length) return { items: [] };

  const { data: profiles, error } = await sb
    .from('profiles')
    .select(PUBLIC_USER_FIELDS)
    .in('id', mutualIds)
    .order('full_name', { ascending: true });
  if (error) throw error;

  const keyword = normalizeVi(q);
  const filtered = (profiles ?? [])
    .filter((p) => !keyword || normalizeVi(p.full_name).includes(keyword))
    .slice(0, limit);
  if (!filtered.length) return { items: [] };

  const signed = await signAvatars(sb, filtered);
  return {
    items: signed.map((p) => ({
      ...p,
      is_self: false,
      is_following: true,
      is_followed_by: true,
      is_mutual: true,
    })),
  };
}

/**
 * @param {object} [deps] thay thế khi test (Supabase giả).
 * @param {() => any} [deps.db] trả về client Supabase service_role.
 */
export function createFollowsRouter({ db = supabaseAdmin } = {}) {
  const r = Router();

  // FR-SOC-05: Danh sách người dùng theo dõi lẫn nhau với người gọi (gợi ý @mention).
  r.get('/mutuals', validate({ query: mutualsQuerySchema }), async (req, res, next) => {
    try {
      const q = String(req.query.q ?? '');
      const limit = Number(req.query.limit ?? 50);
      res.json(await listMutuals(db(), req.user.id, q, limit));
    } catch (e) {
      next(e);
    }
  });

  // FR-SOC-05: Trạng thái theo dõi và nhãn Mutual giữa người gọi và userId.
  r.get('/:userId/status', validate({ params: userIdParam }), async (req, res, next) => {
    try {
      const sb = db();
      await assertUserExists(sb, req.params.userId);
      res.json(await buildFollowStatus(sb, req.user.id, req.params.userId));
    } catch (e) {
      next(e);
    }
  });

  // FR-SOC-05: Danh sách người theo dõi userId.
  r.get('/:userId/followers', validate({ params: userIdParam, query: listQuerySchema }), async (req, res, next) => {
    try {
      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 20);
      res.json(await listFollowRelations(db(), req.user.id, req.params.userId, 'followers', page, limit));
    } catch (e) {
      next(e);
    }
  });

  // FR-SOC-05: Danh sách người mà userId đang theo dõi.
  r.get('/:userId/following', validate({ params: userIdParam, query: listQuerySchema }), async (req, res, next) => {
    try {
      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 20);
      res.json(await listFollowRelations(db(), req.user.id, req.params.userId, 'following', page, limit));
    } catch (e) {
      next(e);
    }
  });

  // FR-SOC-05: Theo dõi người dùng (một chiều; nếu hai chiều → `is_mutual: true`).
  r.post('/:userId', validate({ params: userIdParam }), async (req, res, next) => {
    try {
      const { userId } = req.params;
      if (userId === req.user.id) throw badRequest('Không thể tự theo dõi chính mình');

      const sb = db();
      await assertUserExists(sb, userId);

      const { error } = await sb
        .from('follows')
        .insert({ follower_id: req.user.id, followee_id: userId });
      if (error && error.code !== '23505') throw error;

      const status = await buildFollowStatus(sb, req.user.id, userId);
      res.status(error?.code === '23505' ? 200 : 201).json(status);
    } catch (e) {
      next(e);
    }
  });

  // FR-SOC-05: Bỏ theo dõi người dùng.
  r.delete('/:userId', validate({ params: userIdParam }), async (req, res, next) => {
    try {
      const { userId } = req.params;
      if (userId === req.user.id) throw badRequest('Không thể bỏ theo dõi chính mình');

      const sb = db();
      await assertUserExists(sb, userId);

      const { error } = await sb
        .from('follows')
        .delete()
        .eq('follower_id', req.user.id)
        .eq('followee_id', userId);
      if (error) throw error;

      res.json(await buildFollowStatus(sb, req.user.id, userId));
    } catch (e) {
      next(e);
    }
  });

  return r;
}

export default createFollowsRouter();
