-- Row Level Security (NFR-04). Backend dùng service_role (bỏ qua RLS); RLS là lớp phòng thủ thứ hai
-- nếu ai đó gọi thẳng PostgREST bằng anon key. Mặc định: chỉ ĐỌC trực tiếp, mọi GHI đi qua Express.

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and not is_locked)
$$;

create or replace function public.is_approved_member(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members
                 where group_id = gid and user_id = auth.uid() and status = 'approved')
$$;

alter table public.profiles          enable row level security;
alter table public.groups            enable row level security;
alter table public.group_members     enable row level security;
alter table public.posts             enable row level security;
alter table public.comments          enable row level security;
alter table public.likes             enable row level security;
alter table public.follows           enable row level security;
alter table public.documents         enable row level security;
alter table public.document_ratings  enable row level security;
alter table public.study_sessions    enable row level security;
alter table public.teamup_posts      enable row level security;
alter table public.teamup_requests   enable row level security;
alter table public.notifications     enable row level security;

-- profiles: mọi người đã đăng nhập xem được; chỉ sửa hồ sơ của mình, không tự đổi role/is_locked.
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid()
    and role = (select p.role from public.profiles p where p.id = auth.uid())
    and is_locked = (select p.is_locked from public.profiles p where p.id = auth.uid()));

-- groups: ai đã đăng nhập cũng xem danh sách; ghi do seed/admin (service_role).
create policy groups_select on public.groups for select to authenticated using (true);

-- group_members: xem dòng của mình hoặc cùng nhóm đã duyệt.
create policy gm_select on public.group_members for select to authenticated
  using (user_id = auth.uid() or public.is_approved_member(group_id) or public.is_admin());

-- posts: bài cá nhân thấy được với mọi người; bài nhóm chỉ thành viên đã duyệt.
create policy posts_select on public.posts for select to authenticated
  using (group_id is null or public.is_approved_member(group_id) or public.is_admin());

create policy comments_select on public.comments for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id
                 and (p.group_id is null or public.is_approved_member(p.group_id) or public.is_admin())));

create policy likes_select on public.likes for select to authenticated using (true);
create policy follows_select on public.follows for select to authenticated using (true);

-- documents: mọi sinh viên xem/tải (giả định 2.4.3).
create policy documents_select on public.documents for select to authenticated using (true);
create policy ratings_select on public.document_ratings for select to authenticated using (true);

-- Dữ liệu riêng tư của từng người.
create policy sessions_select_own on public.study_sessions for select to authenticated using (user_id = auth.uid());
create policy notifications_select_own on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- team-up: thành viên đã duyệt của nhóm xem được bài; yêu cầu chỉ chủ bài hoặc người gửi xem.
create policy teamup_select on public.teamup_posts for select to authenticated
  using (public.is_approved_member(group_id) or public.is_admin());
create policy teamup_req_select on public.teamup_requests for select to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from public.teamup_posts t where t.id = teamup_id and t.author_id = auth.uid()));
