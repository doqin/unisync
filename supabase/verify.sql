-- Kiểm tra sau khi chạy 0001..0003 (issue #1). Chạy trong SQL Editor; không để lại dữ liệu.
-- Mọi dòng kết quả phải có ok = true.

with
  tables as (select count(*) n from pg_tables where schemaname = 'public'
             and tablename in ('profiles','groups','group_members','posts','comments','likes','follows',
                               'documents','document_ratings','study_sessions','teamup_posts',
                               'teamup_requests','notifications')),
  rls as (select count(*) n from pg_tables where schemaname = 'public' and rowsecurity),
  trg as (select count(*) n from pg_trigger
          where tgname in ('enforce_edu_vn_email','on_auth_user_created') and not tgisinternal),
  buckets as (select count(*) n from storage.buckets
              where (id = 'documents' and not public and file_size_limit = 10485760)
                 or (id = 'images' and not public and file_size_limit = 1048576))
select 'đủ 13 bảng' as kiem_tra, (select n from tables) = 13 as ok
union all select 'RLS bật trên cả 13 bảng', (select n from rls) = 13
union all select 'có 2 trigger trên auth.users', (select n from trg) = 2
union all select 'bucket documents (10 MB) và images (1 MB) riêng tư', (select n from buckets) = 2
union all select 'f_unaccent hoạt động', public.f_unaccent('Tài liệu') = 'Tai lieu';

-- Trigger .edu.vn: khối này phải báo lỗi "Chỉ chấp nhận email trường có đuôi .edu.vn" ở CẢ BA email sai,
-- và tạo thành công email đúng; cuối cùng hoàn tác (rollback) nên không để lại người dùng.
begin;
  insert into auth.users (id, email) values (gen_random_uuid(), 'ok@sv.uit.edu.vn');            -- phải thành công
  select full_name from public.profiles where full_name = 'ok';                                  -- 1 dòng: hồ sơ tự tạo
rollback;
-- Chạy RIÊNG từng câu dưới đây, mỗi câu phải lỗi:
--   insert into auth.users (id, email) values (gen_random_uuid(), 'x@gmail.com');
--   insert into auth.users (id, email) values (gen_random_uuid(), 'x@fakeedu.vn');
--   insert into auth.users (id, email) values (gen_random_uuid(), 'x@edu.vn.com');
