// Kiểm thử hàm thuần kiểm tra ảnh bài đăng (FR-SOC-01, NFR-06) và phân trang cursor (FR-SOC-02).
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  MAX_POST_IMAGE_SIZE,
  buildPostImagePath,
  checkDeclaredPostImage,
  checkStoredPostImage,
  parsePostImagePath,
} from '../src/lib/postImages.js';
import { decodeCursor, encodeCursor } from '../src/lib/posts.js';
import { HEADS } from './fixtures/heads.js';

test('checkDeclaredPostImage: chấp nhận PNG, JPG, WEBP ≤ 1 MB', () => {
  assert.deepEqual(checkDeclaredPostImage({ mimeType: 'image/png', size: 1024 }), {
    ok: true, type: 'png', mime: 'image/png',
  });
  assert.deepEqual(checkDeclaredPostImage({ mimeType: 'image/jpeg; charset=utf-8', size: MAX_POST_IMAGE_SIZE }), {
    ok: true, type: 'jpg', mime: 'image/jpeg',
  });
  assert.deepEqual(checkDeclaredPostImage({ mimeType: 'image/webp', size: 1 }), {
    ok: true, type: 'webp', mime: 'image/webp',
  });
});

test('checkDeclaredPostImage: từ chối loại ảnh lạ hoặc vượt quá 1 MB', () => {
  assert.equal(checkDeclaredPostImage({ mimeType: 'application/pdf', size: 1000 }).ok, false);
  assert.equal(checkDeclaredPostImage({ mimeType: 'image/gif', size: 1000 }).ok, false);
  assert.equal(checkDeclaredPostImage({ mimeType: 'image/png', size: 0 }).ok, false);
  assert.equal(checkDeclaredPostImage({ mimeType: 'image/png', size: -10 }).ok, false);
  assert.equal(checkDeclaredPostImage({ mimeType: 'image/png', size: MAX_POST_IMAGE_SIZE + 1 }).ok, false);
});

test('checkStoredPostImage: kiểm tra kích thước thật, MIME và magic bytes', () => {
  assert.equal(checkStoredPostImage('png', { size: 500, contentType: 'image/png', head: HEADS.png }), null);
  assert.equal(checkStoredPostImage('jpg', { size: 500, contentType: 'image/jpeg', head: HEADS.jpg }), null);
  assert.equal(checkStoredPostImage('webp', { size: 500, contentType: 'image/webp', head: HEADS.webp }), null);

  assert.ok(checkStoredPostImage('png', { size: MAX_POST_IMAGE_SIZE + 1, contentType: 'image/png', head: HEADS.png }));
  assert.ok(checkStoredPostImage('png', { size: 500, contentType: 'image/jpeg', head: HEADS.png }));
  assert.ok(checkStoredPostImage('png', { size: 500, contentType: 'image/png', head: HEADS.pdf }));
});

test('buildPostImagePath & parsePostImagePath: chỉ nhận posts/<uuid>/<uuid>.png|jpg|webp', () => {
  const uid = randomUUID();
  const path = buildPostImagePath(uid, 'webp');
  assert.deepEqual(parsePostImagePath(path), { userId: uid, type: 'webp' });
  assert.equal(parsePostImagePath(`avatars/${uid}/${randomUUID()}.png`), null);
  assert.equal(parsePostImagePath(`posts/${uid}/../evil.png`), null);
  assert.equal(parsePostImagePath(`posts/${uid}/${randomUUID()}.pdf`), null);
  assert.equal(parsePostImagePath(''), null);
});

test('encodeCursor & decodeCursor: hỗ trợ cả <iso>|<uuid> và <iso> thuần, giữ micro giây và chặn chuỗi lạ', () => {
  const id = randomUUID();
  const c = encodeCursor({ id, created_at: '2026-11-22T10:00:00.123456+00:00' });
  assert.equal(c, `2026-11-22T10:00:00.123456Z|${id}`);
  assert.deepEqual(decodeCursor(c), { createdAt: '2026-11-22T10:00:00.123456Z', id });
  assert.deepEqual(decodeCursor('2026-11-22T10:00:00Z'), { createdAt: '2026-11-22T10:00:00Z', id: null });
  assert.deepEqual(decodeCursor('2026-11-22T17:00:00+07:00'), { createdAt: '2026-11-22T10:00:00.000Z', id: null });

  assert.equal(decodeCursor('not-a-date'), null);
  assert.equal(decodeCursor('2026-11-22T10:00:00Z,id.neq.0'), null);
  assert.equal(decodeCursor('2026-11-22T10:00:00Z|not-a-uuid'), null);
  assert.equal(decodeCursor('2026-11-22T10:00:00Z|' + id + '|extra'), null);
  assert.equal(decodeCursor(''), null);
});
