// Seed nhóm ngành / học phần (FR-GRP-07). Chạy lại được (upsert theo `code`).
// Danh sách dưới đây chỉ là mẫu: Khang thay bằng dữ liệu thật của trường.
import { supabaseAdmin } from '../src/lib/supabase.js';

const groups = [
  { type: 'major',  code: 'MAJ-SE',    name: 'Kỹ thuật phần mềm' },
  { type: 'major',  code: 'MAJ-CS',    name: 'Khoa học máy tính' },
  { type: 'major',  code: 'MAJ-IS',    name: 'Hệ thống thông tin' },
  { type: 'course', code: 'SE347',     name: 'Công nghệ Web và ứng dụng' },
  { type: 'course', code: 'SE358',     name: 'Quản lý dự án phần mềm' },
  { type: 'course', code: 'IT001',     name: 'Nhập môn lập trình' },
].map((g) => ({ ...g, description: `Nhóm ${g.type === 'major' ? 'ngành' : 'học phần'} ${g.name}` }));

const { error, count } = await supabaseAdmin()
  .from('groups').upsert(groups, { onConflict: 'code', count: 'exact' });
if (error) { console.error(error); process.exit(1); }
console.log(`Đã seed ${count ?? groups.length} nhóm.`);
