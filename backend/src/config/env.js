const need = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Thiếu biến môi trường ${k}`);
  return v;
};

// Khóa API mới của Supabase (sb_publishable_… / sb_secret_…); vẫn nhận tên cũ (anon / service_role) để không vỡ môi trường cũ.
const needAny = (...keys) => {
  for (const k of keys) if (process.env[k]) return process.env[k];
  throw new Error(`Thiếu biến môi trường ${keys[0]}`);
};

// Đọc lười: /api/health vẫn trả lời (kèm lỗi rõ ràng) nếu chưa cấu hình.
export const env = {
  get SUPABASE_URL() { return need('SUPABASE_URL'); },
  get SUPABASE_PUBLISHABLE_KEY() { return needAny('SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY'); },
  get SUPABASE_SECRET_KEY() { return needAny('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'); },
  get BREVO_API_KEY() { return process.env.BREVO_API_KEY ?? ''; },
  get BREVO_SENDER_EMAIL() { return process.env.BREVO_SENDER_EMAIL ?? 'noreply@doqin.io.vn'; },
  get FRONTEND_URL() { return process.env.FRONTEND_URL ?? 'http://localhost:5173'; },
  get PORT() { return Number(process.env.PORT ?? 3000); },
};
