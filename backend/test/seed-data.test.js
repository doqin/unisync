import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGroups, majors } from '../scripts/seed-data.js';

const groups = buildGroups();

test('mã nhóm không trùng (upsert theo code)', () => {
  assert.equal(new Set(groups.map((g) => g.code)).size, groups.length);
});

test('mỗi nhóm có type hợp lệ, tên và mô tả', () => {
  for (const g of groups) {
    assert.ok(['course', 'major'].includes(g.type), g.code);
    assert.ok(g.name?.trim() && g.description?.trim(), g.code);
  }
});

test('có đủ ngành và các học phần mà nhóm đang dùng', () => {
  assert.equal(groups.filter((g) => g.type === 'major').length, majors.length);
  for (const code of ['SE347', 'SE358', 'IT001', 'IT002', 'IT003', 'IT004']) {
    assert.ok(groups.some((g) => g.type === 'course' && g.code === code), code);
  }
});

test('không seed khóa luận / thực tập tốt nghiệp', () => {
  assert.ok(!groups.some((g) => /^(Khóa luận tốt nghiệp)/i.test(g.name)));
});
