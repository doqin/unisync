import { supabaseAdmin } from '../lib/supabase.js';
import { forbidden, unauthorized } from '../lib/errors.js';

/**
 * Xác thực JWT của Supabase, nạp hồ sơ vào req.user / req.profile. `db` để test thay client.
 *
 * Chữ ký JWT được kiểm tra tại chỗ bằng `getClaims` (khóa công khai JWKS, được lưu đệm) thay vì gọi
 * `getUser` tới máy chủ Auth: tiết kiệm một vòng mạng ~100 ms cho mỗi yêu cầu. Đổi lại, token đã đăng xuất
 * vẫn hợp lệ đến khi hết hạn (mặc định 1 giờ); tài khoản bị khóa thì vẫn bị chặn ngay nhờ `profiles.is_locked`.
 * Email chưa xác minh không có phiên đăng nhập (bật "Confirm email" trong Supabase Auth) nên không cần kiểm tra lại.
 */
export const makeRequireAuth = (db = supabaseAdmin) => async (req, _res, next) => {
  try {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) throw unauthorized();

    const sb = db();
    // getClaims ném lỗi (không trả `error`) khi token sai định dạng → vẫn phải là 401, không phải 500.
    const { data, error } = await sb.auth.getClaims(token).catch((e) => ({ data: null, error: e }));
    const claims = data?.claims;
    if (error || !claims?.sub) throw unauthorized('Phiên đăng nhập không hợp lệ');

    const { data: profile } = await sb.from('profiles').select('*').eq('id', claims.sub).single();
    if (!profile) throw unauthorized('Không tìm thấy hồ sơ');
    if (profile.is_locked) throw forbidden('Tài khoản đã bị khóa');

    req.user = { id: claims.sub, email: claims.email };
    req.profile = profile;
    next();
  } catch (e) {
    next(e);
  }
};

export const requireAuth = makeRequireAuth();

/** Chỉ cho vai trò toàn hệ thống (profiles.role) nằm trong danh sách. Phải đứng sau requireAuth. */
export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.profile) return next(unauthorized());
  return roles.includes(req.profile.role) ? next() : next(forbidden());
};
