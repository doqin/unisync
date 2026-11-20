import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  MAX_DOCUMENT_SIZE, buildStoragePath, checkDeclaredFile, checkStoredFile, fileTypeFromName, matchesMagic,
  parseStoragePath,
} from '../src/lib/files.js';
import { HEADS } from './fixtures/heads.js';

test('fileTypeFromName: nhận đúng phần mở rộng, không phân biệt hoa thường', () => {
  assert.equal(fileTypeFromName('Bai giang.PDF'), 'pdf');
  assert.equal(fileTypeFromName('anh.jpeg'), 'jpg');
  assert.equal(fileTypeFromName('anh.JPG'), 'jpg');
  assert.equal(fileTypeFromName('slide.pptx'), 'pptx');
  for (const n of ['virus.exe', 'de.pdf.exe', 'khongduoi', 'cu.doc', 'cu.ppt', '', undefined])
    assert.equal(fileTypeFromName(n), null, String(n));
});

test('checkDeclaredFile: chấp nhận tệp hợp lệ, MIME rỗng hoặc octet-stream', () => {
  for (const mimeType of ['application/pdf', 'APPLICATION/PDF', '', undefined, 'application/octet-stream']) {
    const r = checkDeclaredFile({ fileName: 'a.pdf', mimeType, size: 1234 });
    assert.deepEqual(r, { ok: true, fileType: 'pdf', mime: 'application/pdf' }, String(mimeType));
  }
  assert.ok(checkDeclaredFile({ fileName: 'a.png', mimeType: 'image/png', size: MAX_DOCUMENT_SIZE }).ok);
});

test('checkDeclaredFile: từ chối loại, MIME, kích thước sai', () => {
  const bad = [
    { fileName: 'a.exe', mimeType: 'application/x-msdownload', size: 10 },
    { fileName: 'a.pdf', mimeType: 'text/html', size: 10 },
    { fileName: 'a.png', mimeType: 'image/jpeg', size: 10 },
    { fileName: 'a.pdf', mimeType: 'application/pdf', size: 0 },
    { fileName: 'a.pdf', mimeType: 'application/pdf', size: -5 },
    { fileName: 'a.pdf', mimeType: 'application/pdf', size: 1.5 },
    { fileName: 'a.pdf', mimeType: 'application/pdf', size: MAX_DOCUMENT_SIZE + 1 },
  ];
  for (const f of bad) assert.equal(checkDeclaredFile(f).ok, false, JSON.stringify(f));
});

test('matchesMagic: mỗi loại khớp chữ ký của chính nó', () => {
  for (const [type, head] of Object.entries(HEADS)) assert.ok(matchesMagic(type, head), type);
  assert.ok(!matchesMagic('pdf', HEADS.png));
  assert.ok(!matchesMagic('png', HEADS.jpg));
  assert.ok(!matchesMagic('webp', Buffer.from('RIFF\x24\x00\x00\x00WAVEfmt ', 'latin1'))); // RIFF nhưng là WAV
  assert.ok(!matchesMagic('pdf', Buffer.alloc(0)));
  assert.ok(!matchesMagic('pdf', undefined));
});

test('checkStoredFile: kiểm tra kích thước thật, MIME đã lưu và magic bytes', () => {
  const ok = { size: 2048, contentType: 'application/pdf', head: HEADS.pdf };
  assert.equal(checkStoredFile('pdf', ok), null);
  assert.equal(checkStoredFile('pdf', { ...ok, contentType: 'application/pdf; charset=binary' }), null);
  assert.ok(checkStoredFile('pdf', { ...ok, size: MAX_DOCUMENT_SIZE + 1 }));
  assert.ok(checkStoredFile('pdf', { ...ok, size: 0 }));
  assert.ok(checkStoredFile('pdf', { ...ok, contentType: 'image/png' }));
  assert.ok(checkStoredFile('pdf', { ...ok, head: HEADS.png }));
});

test('đường dẫn lưu trữ: tên tệp là UUID, trong thư mục của người tải lên', () => {
  const userId = randomUUID();
  const path = buildStoragePath(userId, 'docx');
  assert.match(path, new RegExp(`^${userId}/[0-9a-f-]{36}\\.docx$`));
  assert.notEqual(path, buildStoragePath(userId, 'docx'));
  assert.deepEqual(parseStoragePath(path), { userId, fileType: 'docx' });
});

test('parseStoragePath: từ chối đường dẫn lạ', () => {
  const u = randomUUID(), f = randomUUID();
  for (const p of [`${u}/${f}.exe`, `${u}/../${f}.pdf`, `../${u}/${f}.pdf`, `${u}/x/${f}.pdf`, `${f}.pdf`,
    `${u}/${f}.pdf/`, `${u}/bai-giang.pdf`, `${u}/${f}.jpeg`, '', undefined])
    assert.equal(parseStoragePath(p), null, String(p));
});
