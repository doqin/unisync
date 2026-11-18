const need = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Thiếu biến môi trường ${k}`);
  return v;
};

// Đọc lười: /api/health vẫn trả lời (kèm lỗi rõ ràng) nếu chưa cấu hình.
export const env = {
  get SUPABASE_URL() { return need('SUPABASE_URL'); },
  get SUPABASE_ANON_KEY() { return need('SUPABASE_ANON_KEY'); },
  get SUPABASE_SERVICE_ROLE_KEY() { return need('SUPABASE_SERVICE_ROLE_KEY'); },
  get BREVO_API_KEY() { return process.env.BREVO_API_KEY ?? ''; },
  get BREVO_SENDER_EMAIL() { return process.env.BREVO_SENDER_EMAIL ?? 'noreply@doqin.io.vn'; },
  get FRONTEND_URL() { return process.env.FRONTEND_URL ?? 'http://localhost:5173'; },
  get PORT() { return Number(process.env.PORT ?? 3000); },
};
