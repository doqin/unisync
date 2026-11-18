-- Bucket riêng tư cho tài liệu (NFR-06): 10 MB, chỉ các MIME được phép; tải xuống qua signed URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png','image/jpeg','image/webp'
])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Ảnh đại diện + ảnh bài đăng: ≤ 1 MB (ảnh nén phía client), riêng tư, xem qua signed URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('images', 'images', false, 1048576, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Không tạo policy cho storage.objects: client chỉ upload qua signed upload URL do Express cấp.
