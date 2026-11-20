// Seed nhóm ngành / học phần (FR-GRP-07). Chạy lại được (upsert theo `code`).
// `npm run seed -- --dry-run` chỉ in số lượng, không cần kết nối CSDL.
import { buildGroups } from './seed-data.js';

const groups = buildGroups();
if (process.argv.includes('--dry-run')) {
  const n = (t) => groups.filter((g) => g.type === t).length;
  console.log(`Dry run: ${groups.length} nhóm (${n('major')} ngành, ${n('course')} học phần).`);
  process.exit(0);
}

const { supabaseAdmin } = await import('../src/lib/supabase.js');
const BATCH = 200;
for (let i = 0; i < groups.length; i += BATCH) {
  const { error } = await supabaseAdmin().from('groups').upsert(groups.slice(i, i + BATCH), { onConflict: 'code' });
  if (error) { console.error(error); process.exit(1); }
}
console.log(`Đã seed ${groups.length} nhóm.`);
