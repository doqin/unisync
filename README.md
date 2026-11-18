# UniSync

Mạng xã hội cho sinh viên (SE347). Đặc tả: [docs/SRS.md](docs/SRS.md).

| Thư mục | Nội dung |
|---|---|
| `frontend/` | Vite + React + React-Bootstrap (dự án Vercel #1) |
| `backend/` | Express REST API, chạy như Vercel Function qua `api/index.js` (dự án Vercel #2) |
| `supabase/` | Migration SQL: schema, RLS, storage buckets |
| `docs/` | SRS, báo cáo |

## Chạy cục bộ

Cần Node ≥ 20 (backend dùng `--env-file`).

1. Tạo dự án Supabase (dev). Chạy `supabase/migrations/*.sql` theo thứ tự trong SQL Editor.
2. `cp backend/.env.example backend/.env` và `cp frontend/.env.example frontend/.env`, điền khóa.
3. Backend: `cd backend && npm install && npm run seed && npm run dev` → http://localhost:3000/api/health
4. Frontend: `cd frontend && npm install && npm run dev` → http://localhost:5173

`SUPABASE_SERVICE_ROLE_KEY` chỉ đặt ở backend.

## Triển khai (Vercel, SRS 6.1)

Hai dự án từ cùng repo, Root Directory lần lượt `frontend` và `backend`. Biến môi trường backend: xem `backend/.env.example`; frontend: `VITE_*`.
Cron `/api/health` chạy hằng ngày (`backend/vercel.json`) để Supabase không tạm dừng.

## Phân công module

Mỗi router stub trong `backend/src/routes/index.js` và mỗi trang trong `frontend/src/pages/` ghi rõ người phụ trách và mã yêu cầu. Thay stub bằng cài đặt thật; thêm route mới theo mẫu `routes/auth.js` (zod + `validate`).
