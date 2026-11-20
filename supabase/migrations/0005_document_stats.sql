-- Đếm lượt tải (FR-DOC-07). Tăng nguyên tử trong CSDL để không mất lượt khi tải đồng thời.
create or replace function public.increment_download(p_id uuid) returns void
language sql security invoker set search_path = public as $$
  update public.documents set download_count = download_count + 1 where id = p_id;
$$;
