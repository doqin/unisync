-- Tìm kiếm tài liệu (FR-DOC-03, FR-DOC-04): full-text không dấu theo tiêu đề, mô tả, tên và mã môn;
-- lọc theo môn và loại tệp. Tên môn nằm ở bảng groups nên không đưa vào chỉ mục documents_fts_idx
-- (0001_schema.sql), truy vấn này không dùng được chỉ mục GIN đó.
create or replace function public.search_documents(
  p_q text, p_group uuid, p_file_type text, p_limit int, p_offset int
) returns setof public.documents
language sql stable security invoker set search_path = public, extensions as $$
  select d.* from public.documents d
  join public.groups g on g.id = d.group_id
  where (p_group is null or d.group_id = p_group)
    and (p_file_type is null or d.file_type = p_file_type)
    and (coalesce(btrim(p_q), '') = '' or
         to_tsvector('simple', public.f_unaccent(
           coalesce(d.title,'') || ' ' || coalesce(d.description,'') || ' ' ||
           coalesce(g.name,'') || ' ' || coalesce(g.code,'')))
         @@ plainto_tsquery('simple', public.f_unaccent(p_q)))
  order by d.created_at desc, d.id
  limit p_limit offset p_offset
$$;
