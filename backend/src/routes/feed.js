// Bảng tin trang chủ (FR-SOC-02) – phụ trách: Đức Huy (dhuyy-06).
//
// Hợp đồng API:
//   - GET /api/feed?cursor=<iso|uuid>&limit=10
//     Bài đăng cá nhân (group_id IS NULL) của người mình theo dõi và của chính mình,
//     sắp xếp mới nhất trước (created_at DESC, id DESC), phân trang bằng cursor.
//     Trả về: { items, next_cursor, has_more }.
import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import {
  DEFAULT_FEED_LIMIT,
  MAX_FEED_LIMIT,
  POST_SELECT,
  applyCursorFilter,
  encodeCursor,
  hydratePosts,
} from '../lib/posts.js';
import { validate } from '../middleware/validate.js';

const FEED_FOLLOWING_CAP = 500;

const feedQuerySchema = z.object({
  cursor: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_FEED_LIMIT).default(DEFAULT_FEED_LIMIT),
});

/**
 * @param {object} [deps] thay thế khi test (Supabase giả).
 * @param {() => any} [deps.db] trả về client Supabase service_role.
 */
export function createFeedRouter({ db = supabaseAdmin } = {}) {
  const r = Router();

  // FR-SOC-02: Bảng tin theo thời gian mới nhất, phân trang cursor theo created_at.
  r.get('/', validate({ query: feedQuerySchema }), async (req, res, next) => {
    try {
      const sb = db();
      const limit = Number(req.query.limit ?? DEFAULT_FEED_LIMIT);

      const { data: following, error: fErr } = await sb
        .from('follows')
        .select('followee_id')
        .eq('follower_id', req.user.id)
        .limit(FEED_FOLLOWING_CAP);
      if (fErr) throw fErr;

      const authorIds = [...new Set([req.user.id, ...(following ?? []).map((f) => f.followee_id)])];

      let q = sb
        .from('posts')
        .select(POST_SELECT)
        .is('group_id', null)
        .in('author_id', authorIds);
      q = applyCursorFilter(q, req.query.cursor);

      const { data: rows, error } = await q
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit + 1);
      if (error) throw error;

      const list = rows ?? [];
      const hasMore = list.length > limit;
      const slice = list.slice(0, limit);
      if (!slice.length) return res.json({ items: [], next_cursor: null, has_more: false });

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

  return r;
}

export default createFeedRouter();
