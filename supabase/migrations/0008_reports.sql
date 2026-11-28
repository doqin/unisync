-- Báo cáo vi phạm (FR-DOC-10). Bảng dùng chung cho mọi loại nội dung để Admin xử lý ở một hàng đợi
-- (FR-ADM-04): tài liệu (Thư viện), bài đăng và bình luận (FR-SOC-08) chỉ khác nhau ở `target_type`.
-- `target_id` không có khóa ngoại vì trỏ tới nhiều bảng; khi nội dung bị xóa, báo cáo vẫn còn làm lịch sử.
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('document', 'post', 'comment')),
  target_id uuid not null,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('copyright', 'inappropriate', 'spam', 'other')),
  detail text check (char_length(detail) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- Mỗi người chỉ có một báo cáo đang chờ cho mỗi nội dung; báo cáo lại được sau khi Admin đã xử lý.
create unique index reports_one_pending on public.reports (target_type, target_id, reporter_id)
  where status = 'pending';
-- Hàng đợi của Admin: báo cáo theo trạng thái, mới nhất trước.
create index reports_status_created on public.reports (status, created_at desc);

-- RLS: chỉ đọc trực tiếp; người báo cáo thấy báo cáo của mình, Admin thấy tất cả. Mọi ghi đi qua Express.
alter table public.reports enable row level security;
create policy reports_select on public.reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());
