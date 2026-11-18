import rateLimit from 'express-rate-limit';

// Lưu ý: bộ nhớ trong tiến trình không chia sẻ giữa các instance Vercel; đủ cho demo (NFR-05).
const make = (windowMs, limit) =>
  rateLimit({ windowMs, limit, standardHeaders: true, legacyHeaders: false,
    message: { error: 'Quá nhiều yêu cầu, vui lòng thử lại sau' } });

export const authLimiter = make(15 * 60_000, 20);
export const uploadLimiter = make(60 * 60_000, 60);
