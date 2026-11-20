import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MEMBERSHIP_CODES, planMemberships } from '../scripts/memberships.js';

const groups = [
  { id: 'g-major', type: 'major', code: 'MAJ-SE' },
  { id: 'g-se347', type: 'course', code: 'SE347' },
  { id: 'g-se358', type: 'course', code: 'SE358' },
  { id: 'g-it001', type: 'course', code: 'IT001' },
  { id: 'g-null', type: 'course', code: null },
];

test('mỗi hồ sơ × mỗi nhóm học phần được chọn → một membership đã duyệt', () => {
  const { rows, groups: chosen } = planMemberships({
    profiles: [{ id: 'u1', role: 'student' }, { id: 'u2', role: 'student' }],
    groups,
  });
  assert.deepEqual(chosen.map((g) => g.code), ['SE347', 'SE358', 'IT001']);
  assert.equal(rows.length, 2 * 3);
  for (const row of rows) {
    assert.equal(row.status, 'approved');
    assert.equal(row.role, 'member');
    assert.ok(['u1', 'u2'].includes(row.user_id));
  }
});

test('không seed vào nhóm ngành và nhóm không có mã', () => {
  const { rows } = planMemberships({ profiles: [{ id: 'u1' }], groups });
  assert.ok(!rows.some((r) => r.group_id === 'g-major' || r.group_id === 'g-null'));
});

test('admin hệ thống vào nhóm với vai trò quản lý để duyệt được yêu cầu tham gia', () => {
  const { rows } = planMemberships({ profiles: [{ id: 'admin', role: 'admin' }], groups });
  assert.ok(rows.length > 0);
  assert.ok(rows.every((r) => r.role === 'manager'));

  const mixed = planMemberships({
    profiles: [{ id: 'admin', role: 'admin' }, { id: 'sv', role: 'student' }],
    groups,
  }).rows;
  assert.equal(mixed.find((r) => r.user_id === 'admin').role, 'manager');
  assert.equal(mixed.find((r) => r.user_id === 'sv').role, 'member');
});

test('báo lại mã học phần không có trong CSDL thay vì bỏ qua im lặng', () => {
  const { rows, missing } = planMemberships({ profiles: [{ id: 'u1' }], groups, codes: ['SE347', 'KHONG-CO'] });
  assert.deepEqual(missing, ['KHONG-CO']);
  assert.equal(rows.length, 1);
});

test('chưa có hồ sơ nào → không tạo dòng nào', () => {
  const { rows } = planMemberships({ profiles: [], groups });
  assert.deepEqual(rows, []);
});

test('danh sách học phần mặc định có mã và không trùng', () => {
  assert.ok(DEFAULT_MEMBERSHIP_CODES.length >= 3);
  assert.equal(new Set(DEFAULT_MEMBERSHIP_CODES).size, DEFAULT_MEMBERSHIP_CODES.length);
  for (const code of DEFAULT_MEMBERSHIP_CODES) assert.match(code, /^[A-Z]{2}\d{3}$/);
});
