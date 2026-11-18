-- UniSync schema (SRS mục 5). Chạy trong Supabase SQL Editor hoặc `supabase db push`.
-- CHƯA được chạy thử trên Postgres thật: kiểm tra trên dự án dev trước.

create extension if not exists unaccent with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Bọc unaccent thành IMMUTABLE để dùng trong chỉ mục full-text (FR-DOC-04).
create or replace function public.f_unaccent(text) returns text
language sql immutable parallel safe
set search_path = extensions, public
as $$ select extensions.unaccent($1) $$;

-- ───────── Bảng ─────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  avatar_url text,
  bio text,
  major text,
  school text,
  year smallint,
  role text not null default 'student' check (role in ('student','admin','moderator')),
  is_locked boolean not null default false,
  pomodoro_settings jsonb not null default '{"focus":25,"short_break":5,"long_break":15,"long_break_every":4}',
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('course','major')),
  name text not null,
  code text unique,
  description text,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  role text not null default 'member' check (role in ('member','manager')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid references public.groups(id) on delete cascade, -- null = bài cá nhân
  content text not null check (char_length(content) between 1 and 5000),
  image_urls text[] not null default '{}' check (cardinality(image_urls) <= 4),
  created_at timestamptz not null default now()
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table public.likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade, -- nhóm học phần
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  file_path text not null unique,
  file_type text not null check (file_type in ('pdf','docx','pptx','png','jpg','webp')),
  file_size integer not null check (file_size > 0 and file_size <= 10485760),
  download_count integer not null default 0, -- (O)
  created_at timestamptz not null default now()
);

create table public.document_ratings ( -- (O)
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  primary key (document_id, user_id)
);

create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 1 and 480),
  label text,
  created_at timestamptz not null default now()
);

create table public.teamup_posts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  roles_needed text[] not null default '{}',
  slots smallint not null check (slots > 0),
  deadline timestamptz,
  status text not null default 'open' check (status in ('open','filled','closed')),
  created_at timestamptz not null default now()
);

create table public.teamup_requests (
  id uuid primary key default gen_random_uuid(),
  teamup_id uuid not null references public.teamup_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  unique (teamup_id, user_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ───────── Chỉ mục ─────────
create index posts_created_idx on public.posts (created_at desc);
create index posts_group_created_idx on public.posts (group_id, created_at desc);
create index posts_author_created_idx on public.posts (author_id, created_at desc);
create index comments_post_idx on public.comments (post_id, created_at);
create index follows_followee_idx on public.follows (followee_id);
create index documents_group_idx on public.documents (group_id, created_at desc);
create index documents_fts_idx on public.documents using gin (
  to_tsvector('simple', public.f_unaccent(coalesce(title,'') || ' ' || coalesce(description,'')))
);
create index study_sessions_user_idx on public.study_sessions (user_id, started_at desc);
create index teamup_group_idx on public.teamup_posts (group_id, created_at desc);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ───────── Ràng buộc email .edu.vn ở phía CSDL (FR-AUTH-01, mục 6) ─────────
create or replace function public.enforce_edu_vn_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is null or lower(new.email) !~ '^[^@\s]+@([a-z0-9-]+\.)+edu\.vn$' then
    raise exception 'Chỉ chấp nhận email trường có đuôi .edu.vn';
  end if;
  return new;
end $$;

drop trigger if exists enforce_edu_vn_email on auth.users;
create trigger enforce_edu_vn_email before insert on auth.users
  for each row execute function public.enforce_edu_vn_email();

-- Tự tạo hồ sơ khi có người dùng mới.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(new.email,'@',1)));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
