# Supabase

Chạy lần lượt `migrations/0001_schema.sql`, `0002_rls.sql`, `0003_storage.sql` trong SQL Editor
(hoặc `supabase db push`). Sau đó seed nhóm: `cd backend && npm run seed`.

Việc thủ công trên dashboard: Auth → bật *Confirm email*; SMTP → Brevo; URL Configuration → thêm `FRONTEND_URL`.
Dùng hai dự án: dev và demo (mục 8 SRS).
