-- Hỗ trợ bình luận phản hồi dạng cây (parent_id) cho FR-SOC-03.
-- Chạy trong Supabase SQL Editor (hoặc `supabase db push`).

alter table public.comments
  add column if not exists parent_id uuid references public.comments(id) on delete cascade;

create index if not exists comments_parent_idx
  on public.comments (parent_id, created_at);
