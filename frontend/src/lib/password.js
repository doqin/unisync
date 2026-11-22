// Quy tắc mật khẩu phía client (FR-AUTH-04/05). Khớp với backend/src/routes/auth.js (đăng ký: 8–72 ký tự);
// Supabase Auth vẫn kiểm tra lại độ dài tối thiểu theo cấu hình dự án.
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 72; // bcrypt chỉ dùng 72 byte đầu

/** @returns {string|null} thông báo lỗi, hoặc null nếu mật khẩu hợp lệ. */
export function passwordError(password) {
  if (password.length < MIN_PASSWORD) return `Mật khẩu tối thiểu ${MIN_PASSWORD} ký tự`;
  if (new TextEncoder().encode(password).length > MAX_PASSWORD) return `Mật khẩu tối đa ${MAX_PASSWORD} byte`;
  return null;
}

/** Lỗi từ supabase.auth.updateUser → câu tiếng Việt. */
export function updatePasswordError(error) {
  switch (error?.code) {
    case 'same_password': return 'Mật khẩu mới phải khác mật khẩu hiện tại';
    case 'weak_password': return 'Mật khẩu quá yếu, hãy dùng mật khẩu dài hơn và khó đoán hơn';
    case 'over_request_rate_limit': return 'Thao tác quá nhanh, vui lòng thử lại sau ít phút';
    case 'session_not_found':
    case 'refresh_token_not_found':
    case 'not_authenticated': return 'Phiên đã hết hạn. Hãy mở lại link trong email hoặc đăng nhập lại';
    default: return 'Chưa đổi được mật khẩu, vui lòng thử lại';
  }
}
