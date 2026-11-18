import test from 'node:test';
import assert from 'node:assert/strict';
import { isEduVnEmail } from '../src/lib/edu.js';

test('chấp nhận email .edu.vn', () => {
  for (const e of ['a@uit.edu.vn', 'a@student.hcmus.edu.vn', 'A@UIT.EDU.VN']) assert.ok(isEduVnEmail(e), e);
});
test('từ chối email khác', () => {
  for (const e of ['a@gmail.com', 'a@edu.vn', 'a@uit.edu.vn.evil.com', 'a@evil-edu.vn', '@uit.edu.vn', 'a b@uit.edu.vn'])
    assert.ok(!isEduVnEmail(e), e);
});
