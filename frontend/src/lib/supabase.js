import { createClient } from '@supabase/supabase-js';

// Frontend chỉ gọi Supabase Auth; dữ liệu nghiệp vụ đi qua Express (SRS 6).
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL ?? 'http://localhost:54321',
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'missing-anon-key',
);
