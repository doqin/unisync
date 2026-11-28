-- Tìm và gợi ý người dùng (FR-SOC-06) – phụ trách: Minh Trọng.
-- Tìm người dùng theo tên, không dấu, không phân biệt hoa thường.
-- Bỏ người gọi và tài khoản bị khóa. Ưu tiên tên bắt đầu bằng từ khóa, sau đó theo tên.
create or replace function public.search_users(
  p_q text, p_exclude uuid, p_limit int, p_offset int
) returns table (
  id uuid, full_name text, avatar_url text, bio text, major text, school text, year smallint
)
language sql stable security invoker set search_path = public, extensions as $$
  select p.id, p.full_name, p.avatar_url, p.bio, p.major, p.school, p.year
  from public.profiles p
  where not p.is_locked
    and (p_exclude is null or p.id <> p_exclude)
    and lower(public.f_unaccent(p.full_name)) like
        '%' || replace(replace(replace(lower(public.f_unaccent(btrim(p_q))), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  order by
    (lower(public.f_unaccent(p.full_name)) like lower(public.f_unaccent(btrim(p_q))) || '%') desc,
    p.full_name, p.id
  limit p_limit offset p_offset
$$;

revoke all on function public.search_users(text, uuid, int, int) from public, anon, authenticated;
grant execute on function public.search_users(text, uuid, int, int) to service_role;

-- Gợi ý người dùng (FR-SOC-06): người viewer chưa theo dõi, bỏ viewer và tài khoản bị khóa.
-- Điểm ưu tiên: đang theo dõi viewer (+4), mỗi người viewer theo dõi cũng theo dõi họ (+1, tối đa +3),
-- cùng ngành (+2), cùng trường (+1). Hòa điểm → người mới tham gia trước.
-- Trả kèm lý do để giao diện hiển thị ("Đang theo dõi bạn", "Cùng ngành"...).
create or replace function public.suggest_users(
  p_viewer uuid, p_limit int, p_offset int
) returns table (
  id uuid, full_name text, avatar_url text, bio text, major text, school text, year smallint,
  follows_me boolean, mutual_count int, same_major boolean, same_school boolean
)
language sql stable security invoker set search_path = public as $$
  with me as (
    select major, school from public.profiles where id = p_viewer
  ),
  my_following as (
    select followee_id from public.follows where follower_id = p_viewer
  ),
  scored as (
    select p.*,
      exists (select 1 from public.follows f where f.follower_id = p.id and f.followee_id = p_viewer) as fm,
      (select count(*)::int from public.follows f
         where f.followee_id = p.id and f.follower_id in (select followee_id from my_following)) as mc,
      coalesce(p.major is not null and p.major = (select major from me), false) as sm,
      coalesce(p.school is not null and p.school = (select school from me), false) as ss
    from public.profiles p
    where not p.is_locked
      and p.id <> p_viewer
      and p.id not in (select followee_id from my_following)
  )
  select s.id, s.full_name, s.avatar_url, s.bio, s.major, s.school, s.year, s.fm, s.mc, s.sm, s.ss
  from scored s
  order by
    (case when s.fm then 4 else 0 end + least(s.mc, 3)
     + case when s.sm then 2 else 0 end + case when s.ss then 1 else 0 end) desc,
    s.created_at desc, s.id
  limit p_limit offset p_offset
$$;

revoke all on function public.suggest_users(uuid, int, int) from public, anon, authenticated;
grant execute on function public.suggest_users(uuid, int, int) to service_role;
