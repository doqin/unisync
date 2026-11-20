import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { supabaseAnon } from '../lib/supabase.js';
import { badRequest } from '../lib/errors.js';
import { isEduVnEmail } from '../lib/edu.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';

const r = Router();
r.use(authLimiter);

// Lỗi signUp đã thành thông điệp tiếng Việt rõ nghĩa (FR-AUTH-01/02).
function registerError(error) {
  switch (error?.code) {
    case 'over_email_send_rate_limit':
      return 'Đã gửi quá nhiều email, thử lại sau ít phút';
    case 'user_already_exists':
      return 'Email này đã được đăng ký';
    case 'weak_password':
      return 'Mật khẩu quá yếu';
    default:
      return 'Đăng ký chưa thành công. Nếu email đã có tài khoản, hãy đăng nhập; thử lại sau nếu vẫn lỗi';
  }
}

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().refine(isEduVnEmail, 'Email phải có đuôi .edu.vn'),
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự').max(72),
  full_name: z.string().trim().min(2).max(100),
});

// FR-AUTH-01/02: kiểm tra .edu.vn phía server, sau đó Supabase gửi email xác minh (qua SMTP Brevo).
// Trigger enforce_edu_vn_email trong CSDL là lớp chặn thứ hai.
r.post('/register', validate({ body: registerSchema }), async (req, res, next) => {
  try {
    const { email, password, full_name } = req.body;
    const { error } = await supabaseAnon().auth.signUp({
      email, password,
      // Trang /verify đọc hash của link xác minh và thông báo kết quả (FR-AUTH-02).
      options: { data: { full_name }, emailRedirectTo: `${env.FRONTEND_URL}/verify` },
    });
    if (error) throw badRequest(registerError(error));
    res.status(201).json({ message: 'Đã gửi email xác minh. Hãy kiểm tra hộp thư.' });
  } catch (e) {
    next(e);
  }
});

export default r;
