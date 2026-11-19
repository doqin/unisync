# AGENTS.md – UniSync

Hướng dẫn cho agent/AI và thành viên khi làm việc trong repo này. Đặc tả: `docs/SRS.md` (tiếng Việt, nguồn sự thật).

## Dự án
Mạng xã hội cho sinh viên (môn SE347), chỉ email `.edu.vn`. Monorepo: `frontend/` (Vite + React + React-Bootstrap), `backend/` (Express 4, ESM), `supabase/migrations/`, `docs/`. Triển khai: một dự án Vercel nhiều service (`vercel.json` gốc): `/api/*` → backend, còn lại → frontend. Chạy cả hai: `vercel dev`.

## Thành viên và module (SRS 12.2)

| GitHub | Tên | Module |
|---|---|---|
| `doqin` | Khang (nhóm trưởng) | Nền tảng, Auth, hồ sơ, quản trị, triển khai, seed |
| `dhuyy-06` | Huy | Mạng xã hội cốt lõi: bài đăng, bình luận, thích, theo dõi, bảng tin, thông báo |
| `thqhuong` | Hướng | Nhóm và Team-up, email thông báo team-up |
| `ImDT06` | Đức Trọng | Thư viện tài liệu, slide thuyết trình |
| `minhtrong2921` | Minh Trọng | Giao diện chung, Landing, tìm kiếm người dùng, Góc học tập |

Mỗi stub trong `backend/src/routes/index.js` và `frontend/src/pages/` ghi người phụ trách. Chỉ sửa module của người khác khi đã trao đổi.

## Quy tắc làm việc
- Issue theo sprint = milestone `Sprint N`; mỗi issue có người nhận, nhãn `m:*` (module), `prio:M|S|O`, `area:*`. Làm theo thứ tự M → S → O.
- Nhánh: `sprN/issue-<số>-<mô-tả-ngắn>`; PR vào `main`, nhắc `Closes #<số>`. Không push thẳng `main` khi đã có người khác làm chung.
- Commit nhỏ, thông điệp rõ ràng. Không commit `.env*` thật (chỉ `.env.example`).
- Không tạo issue bug mới nếu chưa hỏi người phụ trách; ghi lại và hỏi trước.

## Quy tắc kỹ thuật
- **Bảo mật:** `SUPABASE_SERVICE_ROLE_KEY` chỉ ở backend, không bao giờ vào frontend. Mọi API ngoài `/api/health` và `/api/auth/*` đi qua `requireAuth`. Kiểm tra quyền ở backend; RLS là lớp phòng thủ thứ hai (frontend chỉ đọc qua Express, mọi ghi đi qua Express).
- **Đầu vào:** validate bằng zod qua `validate()`; không dùng `dangerouslySetInnerHTML`.
- **Email `.edu.vn`:** mẫu ở `backend/src/lib/edu.js`, `frontend/src/lib/edu.js` và trigger trong `0001_schema.sql` phải khớp nhau.
- **Vercel Functions không trạng thái:** không ghi đĩa, không lưu dữ liệu trong bộ nhớ tiến trình, không tác vụ nền. Gửi email trong cùng request (Brevo, 300 email/ngày).
- **Giới hạn body 4,5 MB:** tệp và ảnh không đi qua Express; dùng signed upload URL → client tải thẳng lên Supabase Storage → client gọi Express xác nhận. Bucket riêng tư, tên tệp là UUID, tệp ≤ 10 MB, ảnh ≤ 1 MB.
- **Streak:** tính theo múi giờ Asia/Ho_Chi_Minh (UTC+7).
- **Giao diện:** tiếng Việt, responsive từ 360 px, có trạng thái đang tải/lỗi/trống, `alt` cho ảnh.
- Frontend gọi API qua `src/lib/api.js` (mặc định `/api`, cùng domain). Express mount mọi route dưới `/api`.
- Thay đổi schema = migration mới `supabase/migrations/000N_*.sql`, không sửa migration đã áp dụng.

## Lệnh
- Backend: `cd backend && npm run dev` · `npm test` · `npm run seed`
- Frontend: `cd frontend && npm run dev` · `npm run build`
- Toàn bộ: `vercel dev` (cổng do `--listen` chọn)
