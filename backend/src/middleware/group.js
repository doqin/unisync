import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { badRequest, forbidden, unauthorized } from '../lib/errors.js';
import { canAccessGroup, canManageGroup } from '../lib/permissions.js';

const uuid = z.string().uuid();

/** Lấy dòng group_members của người dùng trong nhóm (null nếu chưa có). */
export async function getMembership(groupId, userId, db = supabaseAdmin) {
  const { data, error } = await db()
    .from('group_members').select('status, role')
    .eq('group_id', groupId).eq('user_id', userId).maybeSingle();
  if (error) throw error; // lỗi CSDL => 500, không bao giờ mặc định cho phép
  return data;
}

const guard = (allowed) => ({ param = 'id', db = supabaseAdmin, message } = {}) =>
  async (req, _res, next) => {
    try {
      if (!req.profile) throw unauthorized();
      const groupId = req.params[param];
      if (!uuid.safeParse(groupId).success) throw badRequest('Mã nhóm không hợp lệ');
      const membership = await getMembership(groupId, req.profile.id, db);
      if (!allowed(req.profile, membership)) throw forbidden(message);
      req.groupMembership = membership;
      next();
    } catch (e) {
      next(e);
    }
  };

/** Chỉ Admin hoặc quản lý nhóm (đã duyệt) của nhóm `req.params[param]`. Đứng sau requireAuth. */
export const requireGroupManager = guard(canManageGroup);

/** Chỉ Admin hoặc thành viên đã được duyệt của nhóm `req.params[param]`. Đứng sau requireAuth. */
export const requireGroupMember = guard(canAccessGroup);
