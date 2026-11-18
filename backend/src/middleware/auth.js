import { supabaseAdmin } from '../lib/supabase.js';
import { forbidden, unauthorized } from '../lib/errors.js';

/** Xác thực JWT của Supabase, nạp hồ sơ vào req.user / req.profile. */
export async function requireAuth(req, _res, next) {
  try {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) throw unauthorized();

    const sb = supabaseAdmin();
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data?.user) throw unauthorized('Phiên đăng nhập không hợp lệ');
    if (!data.user.email_confirmed_at) throw forbidden('Email chưa được xác minh');

    const { data: profile } = await sb.from('profiles').select('*').eq('id', data.user.id).single();
    if (!profile) throw unauthorized('Không tìm thấy hồ sơ');
    if (profile.is_locked) throw forbidden('Tài khoản đã bị khóa');

    req.user = data.user;
    req.profile = profile;
    next();
  } catch (e) {
    next(e);
  }
}

export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.profile?.role) ? next() : next(forbidden());
