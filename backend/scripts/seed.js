// Seed nhóm ngành / học phần (FR-GRP-07) và thành viên nhóm học phần (dữ liệu demo).
// Chạy lại được: nhóm upsert theo `code`, membership bỏ qua nếu đã có (không ghi đè
// trạng thái pending/rejected mà người dùng đã tạo qua API).
// `npm run seed -- --dry-run` chỉ in số lượng, không cần kết nối CSDL.
// `--no-memberships`: chỉ seed nhóm, không tạo thành viên.
import { buildGroups } from './seed-data.js';
import { DEFAULT_MEMBERSHIP_CODES, planMemberships } from './memberships.js';

const groups = buildGroups();
if (process.argv.includes('--dry-run')) {
  const n = (t) => groups.filter((g) => g.type === t).length;
  console.log(`Dry run: ${groups.length} nhóm (${n('major')} ngành, ${n('course')} học phần).`);
  console.log(`Membership sẽ seed: mỗi hồ sơ × ${DEFAULT_MEMBERSHIP_CODES.join(', ')} (cần CSDL để biết số hồ sơ).`);
  process.exit(0);
}

const { supabaseAdmin } = await import('../src/lib/supabase.js');
const sb = supabaseAdmin();
const BATCH = 200;
for (let i = 0; i < groups.length; i += BATCH) {
  const { error } = await sb.from('groups').upsert(groups.slice(i, i + BATCH), { onConflict: 'code' });
  if (error) { console.error(error); process.exit(1); }
}
console.log(`Đã seed ${groups.length} nhóm.`);

if (!process.argv.includes('--no-memberships')) {
  const { data: profiles, error: pErr } = await sb.from('profiles').select('id, role');
  if (pErr) { console.error(pErr); process.exit(1); }

  const { data: dbGroups, error: gErr } = await sb.from('groups').select('id, type, code');
  if (gErr) { console.error(gErr); process.exit(1); }

  if (!profiles.length) {
    console.log('Chưa có hồ sơ nào trong CSDL — bỏ qua seed thành viên (hồ sơ sinh ra khi đăng ký).');
  } else {
    const { rows, groups: chosen, missing } = planMemberships({ profiles, groups: dbGroups });
    if (missing.length) console.warn(`Bỏ qua mã học phần không có trong CSDL: ${missing.join(', ')}`);

    const { error } = await sb.from('group_members')
      .upsert(rows, { onConflict: 'group_id,user_id', ignoreDuplicates: true });
    if (error) { console.error(error); process.exit(1); }

    console.log(`Đã seed ${rows.length} membership đã duyệt: ${profiles.length} hồ sơ × `
      + `${chosen.length} nhóm học phần (${chosen.map((g) => g.code).join(', ')}).`);
  }
}
