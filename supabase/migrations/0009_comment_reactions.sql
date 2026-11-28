-- Hỗ trợ thả cảm xúc cho bình luận (FR-SOC-03 / NFR-04).
-- Chạy trong Supabase SQL Editor (hoặc `supabase db push`) sau 0008_comment_replies.sql.

create table if not exists public.comment_reactions (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null check (reaction in ('like','love','haha','wow','sad','angry')),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists comment_reactions_comment_idx
  on public.comment_reactions (comment_id);

alter table public.comment_reactions enable row level security;

create policy comment_reactions_select on public.comment_reactions
  for select to authenticated using (true);
