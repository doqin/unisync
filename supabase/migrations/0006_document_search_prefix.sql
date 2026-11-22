-- Tìm kiếm tài liệu theo tiền tố (FR-DOC-04), thay hàm search_documents của 0004 (cùng chữ ký, create or replace).
-- Full-text không dấu theo tiêu đề, mô tả, tên và mã môn;
-- lọc theo môn và loại tệp; sắp xếp theo mới nhất hoặc điểm đánh giá (FR-DOC-08).
-- Từ cuối cùng khớp theo tiền tố (gõ dở vẫn có kết quả khi tìm khi gõ); các từ trước khớp đủ từ.
-- Tên môn nằm ở bảng groups nên không đưa vào chỉ mục documents_fts_idx (0001_schema.sql).
create or replace function public.search_documents(
  p_q text, p_group uuid, p_file_type text, p_sort text, p_limit int, p_offset int
) returns setof public.documents
language sql stable security invoker set search_path = public, extensions as $$
  with stats as (
    select document_id, avg(stars)::numeric as avg_stars from public.document_ratings group by document_id
  ),
  words as (
    select regexp_replace(t.w, '[^[:alnum:]]', '', 'g') as w, t.n
    from unnest(regexp_split_to_array(public.f_unaccent(lower(btrim(coalesce(p_q, '')))), '\s+'))
      with ordinality as t(w, n)
    where regexp_replace(t.w, '[^[:alnum:]]', '', 'g') <> ''
  ),
  query as (
    select string_agg(
      w.w || case when w.n = (select max(n) from words) then ':*' else '' end, ' & ' order by w.n
    ) as expr
    from words w
  )
  select d.* from public.documents d
  join public.groups g on g.id = d.group_id
  left join stats s on s.document_id = d.id
  cross join query q
  where (p_group is null or d.group_id = p_group)
    and (p_file_type is null or d.file_type = p_file_type)
    and (q.expr is null or
         to_tsvector('simple', public.f_unaccent(
           coalesce(d.title,'') || ' ' || coalesce(d.description,'') || ' ' ||
           coalesce(g.name,'') || ' ' || coalesce(g.code,'')))
         @@ to_tsquery('simple', q.expr))
  order by case when p_sort = 'rating' then s.avg_stars end desc nulls last, d.created_at desc, d.id
  limit p_limit offset p_offset
$$;
