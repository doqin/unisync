// Nhóm học phần và nhóm ngành (FR-GRP-*) – phụ trách: Quốc Hướng (thqhuong).
//
// Hợp đồng API giai đoạn Sprint 1 (FR-GRP-01..03), sử dụng bảng `groups` và `group_members`
// (đã thống nhất schema với module Thư viện tài liệu của Đức Trọng):
//   - GET    /api/groups                        Danh sách nhóm (lọc `type`, tìm `q`), kèm trạng thái thành viên của tôi
//   - GET    /api/groups/:id                    Chi tiết nhóm và trạng thái thành viên của tôi
//   - POST   /api/groups/:id/join               Gửi yêu cầu tham gia nhóm (alias: POST /api/groups/:id/requests)
//   - GET    /api/groups/:id/requests           Quản lý nhóm / Admin xem danh sách yêu cầu (?status=pending|approved|rejected)
//   - PATCH  /api/groups/:id/requests/:userId   Quản lý nhóm / Admin duyệt hoặc từ chối (alias: PATCH /api/groups/:id/members/:userId)
import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { forbidden, HttpError, notFound } from '../lib/errors.js';
import { validate } from '../middleware/validate.js';
import { stub } from './_stub.js';

const groupIdParam = z.object({
  id: z.uuid('Nhóm không hợp lệ'),
});

const memberParams = z.object({
  id: z.uuid('Nhóm không hợp lệ'),
  userId: z.uuid('Người dùng không hợp lệ'),
});

const listQuerySchema = z.object({
  type: z.enum(['course', 'major'], { message: 'Loại nhóm không hợp lệ' }).optional(),
  q: z.string().trim().max(200, 'Từ khóa tối đa 200 ký tự').optional(),
});

const requestsQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected'], { message: 'Trạng thái không hợp lệ' }).optional(),
});

const reviewSchema = z.object({
  status: z.enum(['approved', 'rejected'], {
    message: 'Trạng thái duyệt phải là approved hoặc rejected',
  }),
});

/** Chuẩn hóa chữ thường và bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu. */
function foldVi(str) {
  return (str ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}

/** Tải thông tin nhóm theo id; ném 404 nếu không tồn tại. */
async function loadGroup(sb, groupId) {
  const { data, error } = await sb
    .from('groups')
    .select('id, type, name, code, description, created_at')
    .eq('id', groupId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw notFound('Không tìm thấy nhóm');
  return data;
}

/** Kiểm tra người dùng có phải Admin hệ thống hoặc Quản lý nhóm đã được duyệt hay không. */
async function isGroupManagerOrAdmin(sb, groupId, userId, profileRole) {
  if (profileRole === 'admin') return true;
  const { data: member, error } = await sb
    .from('group_members')
    .select('status, role')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return member?.status === 'approved' && member?.role === 'manager';
}

/** Đảm bảo nhóm tồn tại và người gọi là Quản lý nhóm hoặc Admin (FR-GRP-03). */
async function assertGroupManagerOrAdmin(sb, groupId, user, profile) {
  const group = await loadGroup(sb, groupId);
  const allowed = await isGroupManagerOrAdmin(sb, groupId, user.id, profile?.role);
  if (!allowed) throw forbidden('Chỉ quản lý nhóm hoặc quản trị viên mới có quyền thực hiện');
  return group;
}

/**
 * @param {object} [deps] thay thế khi test (Supabase giả).
 * @param {() => any} [deps.db] trả về client Supabase service_role.
 */
export function createGroupsRouter({ db = supabaseAdmin } = {}) {
  const r = Router();

  // FR-GRP-01: Danh sách nhóm (lọc theo loại: course/major, tìm kiếm theo tên/mã/mô tả).
  r.get('/', validate({ query: listQuerySchema }), async (req, res, next) => {
    try {
      const sb = db();
      const type = req.query.type;
      const keyword = foldVi(typeof req.query.q === 'string' ? req.query.q.trim() : '');

      let query = sb.from('groups').select('id, type, name, code, description, created_at');
      if (type) query = query.eq('type', type);
      const { data: groups, error } = await query.order('name');
      if (error) throw error;

      const filtered = keyword
        ? (groups ?? []).filter(
            (g) =>
              foldVi(g.name).includes(keyword) ||
              foldVi(g.code).includes(keyword) ||
              foldVi(g.description).includes(keyword),
          )
        : (groups ?? []);

      const { data: memberships, error: mErr } = await sb
        .from('group_members')
        .select('group_id, status, role, joined_at')
        .eq('user_id', req.user.id);
      if (mErr) throw mErr;

      const byGroup = new Map((memberships ?? []).map((m) => [m.group_id, m]));
      const items = filtered.map((g) => {
        const m = byGroup.get(g.id);
        return { ...g, my_status: m?.status ?? null, my_role: m?.role ?? null };
      });

      res.json({ items });
    } catch (e) {
      next(e);
    }
  });

  // FR-GRP-01: Chi tiết một nhóm kèm trạng thái thành viên của người gọi.
  r.get('/:id', validate({ params: groupIdParam }), async (req, res, next) => {
    try {
      const sb = db();
      const group = await loadGroup(sb, req.params.id);
      const { data: member, error } = await sb
        .from('group_members')
        .select('status, role')
        .eq('group_id', req.params.id)
        .eq('user_id', req.user.id)
        .maybeSingle();
      if (error) throw error;

      res.json({ ...group, my_status: member?.status ?? null, my_role: member?.role ?? null });
    } catch (e) {
      next(e);
    }
  });

  // FR-GRP-02: Gửi yêu cầu tham gia nhóm (hoặc gửi lại nếu trước đó bị từ chối).
  const handleJoin = async (req, res, next) => {
    try {
      const sb = db();
      const groupId = req.params.id;
      await loadGroup(sb, groupId);

      const { data: existing, error: exErr } = await sb
        .from('group_members')
        .select('group_id, user_id, status, role, joined_at')
        .eq('group_id', groupId)
        .eq('user_id', req.user.id)
        .maybeSingle();
      if (exErr) throw exErr;

      if (existing?.status === 'approved') {
        throw new HttpError(409, 'Bạn đã là thành viên của nhóm này');
      }
      if (existing?.status === 'pending') {
        throw new HttpError(409, 'Yêu cầu tham gia nhóm đang chờ duyệt');
      }

      if (existing?.status === 'rejected') {
        const { data: updated, error: upErr } = await sb
          .from('group_members')
          .update({ status: 'pending', role: 'member', joined_at: new Date().toISOString() })
          .eq('group_id', groupId)
          .eq('user_id', req.user.id)
          .select()
          .single();
        if (upErr) throw upErr;
        return res.status(200).json(updated);
      }

      const { data: created, error: insErr } = await sb
        .from('group_members')
        .insert({ group_id: groupId, user_id: req.user.id, status: 'pending', role: 'member' })
        .select()
        .single();
      if (insErr) throw insErr;
      res.status(201).json(created);
    } catch (e) {
      next(e);
    }
  };

  r.post('/:id/join', validate({ params: groupIdParam }), handleJoin);
  r.post('/:id/requests', validate({ params: groupIdParam }), handleJoin);

  // FR-GRP-03: Quản lý nhóm / Admin xem danh sách yêu cầu tham gia (mặc định: pending).
  r.get(
    '/:id/requests',
    validate({ params: groupIdParam, query: requestsQuerySchema }),
    async (req, res, next) => {
      try {
        const sb = db();
        const groupId = req.params.id;
        const statusFilter = req.query.status || 'pending';

        await assertGroupManagerOrAdmin(sb, groupId, req.user, req.profile);

        const { data: members, error: mErr } = await sb
          .from('group_members')
          .select('group_id, user_id, status, role, joined_at')
          .eq('group_id', groupId)
          .eq('status', statusFilter)
          .order('joined_at');
        if (mErr) throw mErr;

        const list = members ?? [];
        if (list.length === 0) return res.json({ items: [] });

        const userIds = list.map((m) => m.user_id);
        const { data: profiles, error: pErr } = await sb
          .from('profiles')
          .select('id, full_name, avatar_url, major, school, year')
          .in('id', userIds);
        if (pErr) throw pErr;

        const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
        const items = list.map((m) => ({
          ...m,
          user: profileMap.get(m.user_id) ?? null,
        }));

        res.json({ items });
      } catch (e) {
        next(e);
      }
    },
  );

  // FR-GRP-03: Quản lý nhóm / Admin duyệt hoặc từ chối yêu cầu tham gia nhóm.
  const handleReview = async (req, res, next) => {
    try {
      const sb = db();
      const { id: groupId, userId } = req.params;
      await assertGroupManagerOrAdmin(sb, groupId, req.user, req.profile);

      const { data: existing, error: exErr } = await sb
        .from('group_members')
        .select('group_id, user_id, status, role')
        .eq('group_id', groupId)
        .eq('user_id', userId)
        .maybeSingle();
      if (exErr) throw exErr;
      if (!existing) throw notFound('Không tìm thấy yêu cầu tham gia nhóm');

      const patch = { status: req.body.status };
      if (req.body.status === 'approved') patch.joined_at = new Date().toISOString();

      const { data: updated, error: upErr } = await sb
        .from('group_members')
        .update(patch)
        .eq('group_id', groupId)
        .eq('user_id', userId)
        .select()
        .single();
      if (upErr) throw upErr;

      res.json(updated);
    } catch (e) {
      next(e);
    }
  };

  r.patch('/:id/requests/:userId', validate({ params: memberParams, body: reviewSchema }), handleReview);
  r.patch('/:id/members/:userId', validate({ params: memberParams, body: reviewSchema }), handleReview);

  // Phần còn lại của module (tab nhóm, bài đăng nhóm, rời nhóm: #23–#24) chưa cài đặt.
  r.use(stub('Nhóm', 'FR-GRP-04..06', 'Hướng'));
  return r;
}

export default createGroupsRouter();
