import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

let admin;
/** Client service_role: bỏ qua RLS. Chỉ dùng trong backend, sau khi đã kiểm tra quyền. */
export const supabaseAdmin = () =>
  (admin ??= createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts));

/** Client anon (đăng ký, đăng nhập). */
export const supabaseAnon = () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, opts);
