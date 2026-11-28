-- Hỗ trợ thả cảm xúc cho bình luận (FR-SOC-03 / NFR-04).
-- Chạy trong Supabase SQL Editor (hoặc `supabase db push`) sau 0009_comment_replies.sql.

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

-- Giới hạn đọc theo cùng quy tắc với comments_select (0002_rls.sql): tránh lộ cảm xúc bình luận nhóm kín.
drop policy if exists comment_reactions_select on public.comment_reactions;
create policy comment_reactions_select on public.comment_reactions
  for select to authenticated
  using (exists (
    select 1
    from public.comments c
    join public.posts p on p.id = c.post_id
    where c.id = comment_id
      and (p.group_id is null or public.is_approved_member(p.group_id) or public.is_admin())
  ));
