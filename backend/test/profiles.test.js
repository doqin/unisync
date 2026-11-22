// Kiểm thử hồ sơ và ảnh đại diện (FR-PRO-02) với Supabase giả, không cần CSDL thật.
import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { createProfilesRouter } from '../src/routes/profiles.js';
import { errorHandler } from '../src/middleware/error.js';
import { MAX_AVATAR_SIZE, buildAvatarPath, parseAvatarPath, signAvatar } from '../src/lib/avatar.js';
import { HEADS } from './fixtures/heads.js';

const USER = randomUUID();
const OTHER = randomUUID();

/** Supabase giả: đủ các hàm mà routes/profiles.js dùng. */
function fakeSupabase() {
  const profiles = [{
    id: USER, full_name: 'Nguyễn Văn A', avatar_url: null, bio: 'Xin chào', major: 'KTPM', school: 'UIT', year: 3,
    role: 'student', is_locked: false,
  }];
  const objects = {}; // path → { size, contentType, head }
  const removed = [];
  const updates = []; // mọi bản vá đã ghi vào profiles

  const from = () => {
    let id = null;
    let patch = null;
    const q = {
      update: (p) => ((patch = p), q),
      select: () => q,
      eq: (_k, v) => ((id = v), q),
      single: async () => {
        const hit = profiles.find((p) => p.id === id);
        if (!hit) return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
        updates.push(patch);
        Object.assign(hit, patch);
        return { data: { ...hit }, error: null };
      },
    };
    return q;
  };

  const bucket = {
    createSignedUploadUrl: async (path) =>
      ({ data: { path, token: 'tok', signedUrl: `https://sb.test/upload/${path}?token=tok` }, error: null }),
    info: async (path) => (objects[path]
      ? { data: { size: objects[path].size, contentType: objects[path].contentType }, error: null }
      : { data: null, error: { message: 'Object not found' } }),
    createSignedUrl: async (path, ttl) => ({ data: { signedUrl: `https://sb.test/object/${path}?ttl=${ttl}` }, error: null }),
    remove: async (paths) => {
      for (const p of paths) { removed.push(p); delete objects[p]; }
      return { data: [], error: null };
    },
  };

  return { profiles, objects, removed, updates, from, storage: { from: (b) => (b === 'images' ? bucket : assert.fail(`bucket lạ: ${b}`)) } };
}

let sb, server, base, profile;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: USER }; req.profile = profile; next(); }); // thay cho requireAuth
  app.use('/api/profiles', createProfilesRouter({
    db: () => sb,
    readHead: async (_sb, path) => sb.objects[path].head,
  }));
  app.use(errorHandler);
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}/api/profiles`;
});
after(() => server.close());
beforeEach(() => { sb = fakeSupabase(); profile = { ...sb.profiles[0] }; });

const send = async (method, path, body) => {
  const res = await fetch(base + path, {
    method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

// ───── PATCH /me ─────

test('sửa hồ sơ: cập nhật các trường cho phép và chỉ ghi đúng các trường đó', async () => {
  const { status, body } = await send('PATCH', '/me', { full_name: '  Trần Thị B ', bio: 'Thích Web', year: 2 });
  assert.equal(status, 200);
  assert.equal(body.full_name, 'Trần Thị B');
  assert.equal(body.bio, 'Thích Web');
  assert.equal(body.year, 2);
  assert.deepEqual(sb.updates, [{ full_name: 'Trần Thị B', bio: 'Thích Web', year: 2 }]);
});

test('sửa hồ sơ: chuỗi rỗng hoặc null xóa trường không bắt buộc', async () => {
  const { status, body } = await send('PATCH', '/me', { bio: '   ', major: null, year: null });
  assert.equal(status, 200);
  assert.equal(body.bio, null);
  assert.equal(body.major, null);
  assert.equal(body.year, null);
});

test('sửa hồ sơ: không cho tự đổi role hoặc is_locked', async () => {
  for (const extra of [{ role: 'admin' }, { is_locked: false }, { id: OTHER }, { avatar_url: 'https://x.test/a.png' }]) {
    const { status } = await send('PATCH', '/me', { full_name: 'Tên mới', ...extra });
    assert.equal(status, 400, JSON.stringify(extra));
  }
  assert.deepEqual(sb.updates, []);
  assert.equal(sb.profiles[0].role, 'student');
});

test('sửa hồ sơ: dữ liệu sai bị từ chối', async () => {
  for (const bad of [{}, { full_name: 'A' }, { full_name: 'x'.repeat(101) }, { bio: 'x'.repeat(501) }, { year: 0 }, { year: 9 }, { year: 2.5 }]) {
    const { status } = await send('PATCH', '/me', bad);
    assert.equal(status, 400, JSON.stringify(bad));
  }
  assert.deepEqual(sb.updates, []);
});

test('sửa hồ sơ: trả avatar_url là signed URL, không phải đường dẫn thô', async () => {
  const path = buildAvatarPath(USER, 'webp');
  sb.profiles[0].avatar_url = path;
  const { body } = await send('PATCH', '/me', { bio: 'Mới' });
  assert.equal(body.avatar_url, `https://sb.test/object/${path}?ttl=3600`);
});

// ───── Bước 1: POST /me/avatar-url ─────

test('avatar-url: cấp signed upload URL, đường dẫn trong thư mục của người dùng, tên là UUID', async () => {
  const { status, body } = await send('POST', '/me/avatar-url', { mime_type: 'image/webp', file_size: 50_000 });
  assert.equal(status, 201);
  assert.match(body.path, new RegExp(`^avatars/${USER}/[0-9a-f-]{36}\\.webp$`));
  assert.equal(body.token, 'tok');
  assert.equal(body.content_type, 'image/webp');
});

test('avatar-url: từ chối loại ảnh lạ và kích thước sai', async () => {
  for (const bad of [
    { mime_type: 'image/gif', file_size: 1000 },
    { mime_type: 'application/pdf', file_size: 1000 },
    { mime_type: 'image/png', file_size: MAX_AVATAR_SIZE + 1 },
    { mime_type: 'image/png', file_size: 0 },
    { mime_type: 'image/png', file_size: 1.5 },
    { mime_type: 'image/png' },
  ]) {
    const { status } = await send('POST', '/me/avatar-url', bad);
    assert.equal(status, 400, JSON.stringify(bad));
  }
});

test('avatar-url: đúng 1 MB vẫn được chấp nhận', async () => {
  const { status } = await send('POST', '/me/avatar-url', { mime_type: 'image/jpeg', file_size: MAX_AVATAR_SIZE });
  assert.equal(status, 201);
});

// ───── Bước 3: POST /me/avatar ─────

const uploadFake = (type = 'png', object) => {
  const path = buildAvatarPath(USER, type);
  const mime = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[type];
  sb.objects[path] = object ?? { size: 30_000, contentType: mime, head: HEADS[type] };
  return path;
};

test('xác nhận: ghi avatar_url là đường dẫn, trả signed URL', async () => {
  const path = uploadFake('png');
  const { status, body } = await send('POST', '/me/avatar', { path });
  assert.equal(status, 200);
  assert.equal(sb.profiles[0].avatar_url, path);
  assert.equal(body.avatar_url, `https://sb.test/object/${path}?ttl=3600`);
  assert.equal(body.role, 'student');
});

test('xác nhận: chấp nhận cả jpg và webp', async () => {
  for (const type of ['jpg', 'webp']) {
    const { status } = await send('POST', '/me/avatar', { path: uploadFake(type) });
    assert.equal(status, 200, type);
  }
});

test('xác nhận: xóa ảnh đại diện cũ sau khi đổi', async () => {
  const oldPath = uploadFake('jpg');
  profile.avatar_url = oldPath;
  sb.profiles[0].avatar_url = oldPath;
  const path = uploadFake('png');
  const { status } = await send('POST', '/me/avatar', { path });
  assert.equal(status, 200);
  assert.deepEqual(sb.removed, [oldPath]);
  assert.equal(sb.profiles[0].avatar_url, path);
});

test('xác nhận: không xóa ảnh cũ không thuộc thư mục của mình', async () => {
  profile.avatar_url = buildAvatarPath(OTHER, 'png');
  const { status } = await send('POST', '/me/avatar', { path: uploadFake('png') });
  assert.equal(status, 200);
  assert.deepEqual(sb.removed, []);
});

test('xác nhận: không nhận đường dẫn của người khác hoặc đường dẫn sai dạng', async () => {
  const theirs = buildAvatarPath(OTHER, 'png');
  sb.objects[theirs] = { size: 1000, contentType: 'image/png', head: HEADS.png };
  assert.equal((await send('POST', '/me/avatar', { path: theirs })).status, 403);
  for (const path of ['', 'avatars/abc.png', `${USER}/${randomUUID()}.png`, `avatars/${USER}/../${randomUUID()}.png`, `avatars/${USER}/${randomUUID()}.gif`]) {
    assert.equal((await send('POST', '/me/avatar', { path })).status, 400, path);
  }
  assert.equal(sb.profiles[0].avatar_url, null);
  assert.deepEqual(sb.removed, []); // không đụng vào ảnh người khác
});

test('xác nhận: chưa tải ảnh lên thì báo lỗi', async () => {
  const { status } = await send('POST', '/me/avatar', { path: buildAvatarPath(USER, 'png') });
  assert.equal(status, 400);
  assert.equal(sb.profiles[0].avatar_url, null);
});

test('xác nhận: ảnh quá 1 MB, sai MIME hoặc sai magic bytes bị từ chối và xóa khỏi kho', async () => {
  const cases = {
    'quá 1 MB': { size: MAX_AVATAR_SIZE + 1, contentType: 'image/png', head: HEADS.png },
    'MIME lạ': { size: 1000, contentType: 'application/pdf', head: HEADS.png },
    'MIME lệch loại': { size: 1000, contentType: 'image/jpeg', head: HEADS.png },
    'magic bytes sai': { size: 1000, contentType: 'image/png', head: HEADS.pdf },
  };
  for (const [name, object] of Object.entries(cases)) {
    sb = fakeSupabase();
    const path = uploadFake('png', object);
    const { status } = await send('POST', '/me/avatar', { path });
    assert.equal(status, 400, name);
    assert.deepEqual(sb.removed, [path], name);
    assert.equal(sb.profiles[0].avatar_url, null, name);
  }
});

// ───── lib/avatar ─────

test('parseAvatarPath: chỉ nhận avatars/<uuid>/<uuid>.png|jpg|webp', () => {
  const p = buildAvatarPath(USER, 'jpg');
  assert.deepEqual(parseAvatarPath(p), { userId: USER, type: 'jpg' });
  assert.equal(parseAvatarPath(null), null);
  assert.equal(parseAvatarPath(p.replace('.jpg', '.jpeg')), null);
  assert.equal(parseAvatarPath(`x/${p}`), null);
});

test('signAvatar: không có ảnh hoặc giá trị lạ → null, không ném lỗi', async () => {
  assert.equal((await signAvatar(sb, { id: USER, avatar_url: null })).avatar_url, null);
  assert.equal((await signAvatar(sb, { id: USER, avatar_url: 'javascript:alert(1)' })).avatar_url, null);
  assert.equal(await signAvatar(sb, null), null);
});
