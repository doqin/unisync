-- Mở rộng bảng likes của bài đăng để lưu 6 loại cảm xúc giống bình luận (FR-SOC-04).
-- Tương thích ngược: các lượt thích cũ tự nhận giá trị mặc định 'love'.

alter table public.likes
  add column if not exists reaction text not null default 'love'
  check (reaction in ('like','love','haha','wow','sad','angry'));
