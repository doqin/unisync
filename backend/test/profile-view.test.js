// Kiểm thử xem hồ sơ và danh sách bài đăng của người đó (FR-PRO-01, FR-PRO-03) với Supabase giả.
import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { createProfilesRouter } from '../src/routes/profiles.js';
import { errorHandler } from '../src/middleware/error.js';
import { buildAvatarPath } from '../src/lib/avatar.js';

const VIEWER = randomUUID();
const AUTHOR = randomUUID();
const LONER = randomUUID();
const MY_GROUP = randomUUID();
const OTHER_GROUP = randomUUID();

/** Supabase giả: đủ select/eq/in/is/or/order/range/count mà các route xem hồ sơ dùng. */
function fakeSupabase(tables) {
  const from = (table) => {
    const preds = [];
    const orders = [];
    let head = false;
    let slice = null;
    let cols = null; // như PostgREST: chỉ trả các cột được select
    const project = (r) => (cols ? Object.fromEntries(cols.filter((c) => c in r).map((c) => [c, r[c]])) : r);
    const rows = () => {
      let out = (tables[table] ?? []).filter((r) => preds.every((p) => p(r)));
      for (const [k, asc] of [...orders].reverse()) {
        out = [...out].sort((a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * (asc ? 1 : -1));
      }
      return (slice ? out.slice(slice[0], slice[1] + 1) : out).map(project);
    };
    const q = {
      select: (c, opts) => {
        head = Boolean(opts?.head);
        cols = c && c !== '*' ? c.split(',').map((x) => x.trim()) : null;
        return q;
      },
      eq: (k, v) => (preds.push((r) => r[k] === v), q),
      in: (k, v) => (preds.push((r) => v.includes(r[k])), q),
      is: (k, v) => (preds.push((r) => (r[k] ?? null) === v), q),
      or: (expr) => {
        // Chỉ hỗ trợ dạng "col.is.null,col.in.(a,b)" mà route dùng.
        const parts = expr.match(/(\w+)\.is\.null|(\w+)\.in\.\(([^)]*)\)/g).map((t) => {
          const isNull = /^(\w+)\.is\.null$/.exec(t);
          if (isNull) return (r) => (r[isNull[1]] ?? null) === null;
          const [, col, list] = /^(\w+)\.in\.\((.*)\)$/.exec(t);
          return (r) => list.split(',').includes(r[col]);
        });
        preds.push((r) => parts.some((p) => p(r)));
        return q;
      },
      order: (k, { ascending }) => (orders.push([k, ascending]), q),
      range: (a, b) => ((slice = [a, b]), q),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (ok, fail) => Promise.resolve(head
        ? { count: rows().length, data: null, error: null }
        : { data: rows(), error: null }).then(ok, fail),
    };
    return q;
  };
  const bucket = {
    createSignedUrl: async (path, ttl) => ({ data: { signedUrl: `https://sb.test/object/${path}?ttl=${ttl}` }, error: null }),
    createSignedUrls: async (paths) => ({
      data: paths.map((path) => (path.startsWith('missing/')
        ? { path, signedUrl: null, error: 'not found' }
        : { path, signedUrl: `https://sb.test/object/${path}`, error: null })),
      error: null,
    }),
  };
  return { from, storage: { from: () => bucket } };
}

let tables, server, base;

const baseTables = () => ({
  profiles: [
    { id: VIEWER, full_name: 'Người Xem', avatar_url: null, bio: null, major: null, school: null, year: null, created_at: '2026-11-01T00:00:00Z',
      email: 'xem@x.edu.vn', role: 'student', is_locked: false },
    { id: AUTHOR, full_name: 'Tác Giả', avatar_url: buildAvatarPath(AUTHOR, 'webp'), bio: 'Thích Web', major: 'KTPM', school: 'UIT', year: 3,
      created_at: '2026-11-02T00:00:00Z', email: 'tg@x.edu.vn', role: 'admin', is_locked: false },
    { id: LONER, full_name: 'Một Mình', avatar_url: null, bio: null, major: null, school: null, year: null, created_at: '2026-11-03T00:00:00Z' },
  ],
  follows: [
    { follower_id: VIEWER, followee_id: AUTHOR },
    { follower_id: LONER, followee_id: AUTHOR },
    { follower_id: AUTHOR, followee_id: VIEWER },
  ],
  group_members: [
    { group_id: MY_GROUP, user_id: VIEWER, status: 'approved' },
    { group_id: OTHER_GROUP, user_id: VIEWER, status: 'pending' },
  ],
  groups: [{ id: MY_GROUP, name: 'SE347' }, { id: OTHER_GROUP, name: 'IT004' }],
  posts: [],
  likes: [],
  comments: [],
});

const post = (n, over = {}) => ({
  id: randomUUID(), author_id: AUTHOR, group_id: null, content: `Bài ${n}`, image_urls: [],
  created_at: new Date(Date.UTC(2026, 10, 10, 0, n)).toISOString(), ...over,
});

before(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: VIEWER }; next(); }); // thay cho requireAuth
  app.use('/api/profiles', createProfilesRouter({ db: () => fakeSupabase(tables) }));
  app.use(errorHandler);
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}/api/profiles`;
});
after(() => server.close());
beforeEach(() => { tables = baseTables(); });

const get = async (path) => {
  const res = await fetch(base + path);
  return { status: res.status, body: await res.json() };
};

// ───── GET /:id ─────

test('hồ sơ: trả thông tin công khai kèm số người theo dõi / đang theo dõi', async () => {
  const { status, body } = await get(`/${AUTHOR}`);
  assert.equal(status, 200);
  assert.equal(body.full_name, 'Tác Giả');
  assert.equal(body.major, 'KTPM');
  assert.equal(body.school, 'UIT');
  assert.equal(body.year, 3);
  assert.equal(body.bio, 'Thích Web');
  assert.equal(body.followers_count, 2);
  assert.equal(body.following_count, 1);
  assert.equal(body.is_self, false);
});

test('hồ sơ: avatar_url là signed URL', async () => {
  const { body } = await get(`/${AUTHOR}`);
  assert.equal(body.avatar_url, `https://sb.test/object/${tables.profiles[1].avatar_url}?ttl=3600`);
});

test('hồ sơ: không lộ email, role, is_locked', async () => {
  const { body } = await get(`/${AUTHOR}`);
  for (const k of ['email', 'role', 'is_locked', 'pomodoro_settings']) assert.ok(!(k in body), k);
});

test('hồ sơ: chưa có ai theo dõi → 0, chưa có ảnh → null; xem hồ sơ của mình → is_self', async () => {
  const lone = (await get(`/${LONER}`)).body;
  assert.equal(lone.followers_count, 0);
  assert.equal(lone.following_count, 1);
  assert.equal(lone.avatar_url, null);
  assert.equal((await get(`/${VIEWER}`)).body.is_self, true);
});

test('hồ sơ: không tồn tại → 404, id sai dạng → 400', async () => {
  assert.equal((await get(`/${randomUUID()}`)).status, 404);
  assert.equal((await get('/khong-phai-uuid')).status, 400);
});

// ───── GET /:id/posts ─────

test('bài đăng: mới nhất trước, kèm số thích / bình luận / đã thích', async () => {
  const [a, b] = [post(1), post(2)];
  tables.posts.push(a, b);
  tables.likes.push({ post_id: b.id, user_id: VIEWER }, { post_id: b.id, user_id: LONER }, { post_id: a.id, user_id: LONER });
  tables.comments.push({ post_id: b.id }, { post_id: b.id }, { post_id: b.id });
  const { status, body } = await get(`/${AUTHOR}/posts`);
  assert.equal(status, 200);
  assert.deepEqual(body.items.map((p) => p.id), [b.id, a.id]);
  assert.equal(body.items[0].like_count, 2);
  assert.equal(body.items[0].comment_count, 3);
  assert.equal(body.items[0].liked_by_me, true);
  assert.equal(body.items[1].like_count, 1);
  assert.equal(body.items[1].liked_by_me, false);
  assert.equal(body.items[1].comment_count, 0);
  assert.equal(body.has_more, false);
});

test('bài đăng: chỉ bài của người đó', async () => {
  tables.posts.push(post(1), post(2, { author_id: LONER }));
  const { body } = await get(`/${AUTHOR}/posts`);
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].author_id, AUTHOR);
});

test('bài đăng: bài nhóm chỉ hiện với thành viên đã duyệt của nhóm', async () => {
  const personal = post(1);
  const mine = post(2, { group_id: MY_GROUP });
  const pending = post(3, { group_id: OTHER_GROUP }); // người xem mới chờ duyệt
  const stranger = post(4, { group_id: randomUUID() });
  tables.posts.push(personal, mine, pending, stranger);
  const { body } = await get(`/${AUTHOR}/posts`);
  assert.deepEqual(body.items.map((p) => p.id), [mine.id, personal.id]);
  assert.deepEqual(body.items[0].group, { id: MY_GROUP, name: 'SE347' });
  assert.equal(body.items[1].group, null);
});

test('bài đăng: người xem chưa vào nhóm nào vẫn thấy bài cá nhân', async () => {
  tables.group_members = [];
  tables.posts.push(post(1), post(2, { group_id: MY_GROUP }));
  const { body } = await get(`/${AUTHOR}/posts`);
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].group, null);
});

test('bài đăng: phân trang 10 bài/trang, has_more đúng, không trùng giữa các trang', async () => {
  for (let i = 1; i <= 23; i++) tables.posts.push(post(i));
  const p1 = (await get(`/${AUTHOR}/posts?page=1`)).body;
  const p2 = (await get(`/${AUTHOR}/posts?page=2`)).body;
  const p3 = (await get(`/${AUTHOR}/posts?page=3`)).body;
  assert.deepEqual([p1.items.length, p2.items.length, p3.items.length], [10, 10, 3]);
  assert.deepEqual([p1.has_more, p2.has_more, p3.has_more], [true, true, false]);
  assert.equal(p1.page, 1);
  const all = [...p1.items, ...p2.items, ...p3.items].map((p) => p.content);
  assert.equal(new Set(all).size, 23);
  assert.equal(all[0], 'Bài 23');
  assert.equal(all[22], 'Bài 1');
  assert.equal((await get(`/${AUTHOR}/posts?page=4`)).body.items.length, 0);
});

test('bài đăng: đúng 10 bài thì không còn trang sau', async () => {
  for (let i = 1; i <= 10; i++) tables.posts.push(post(i));
  const { body } = await get(`/${AUTHOR}/posts`);
  assert.equal(body.items.length, 10);
  assert.equal(body.has_more, false);
});

test('bài đăng: ảnh đổi sang signed URL, ảnh không ký được thì bỏ; không lộ đường dẫn gốc', async () => {
  // Đường dẫn đúng dạng của #10: posts/<user_id>/<uuid>.<loại>
  const good = `posts/${AUTHOR}/${randomUUID()}.webp`;
  tables.posts.push(post(1, { image_urls: [good, 'missing/b.webp'] }));
  const { body } = await get(`/${AUTHOR}/posts`);
  assert.deepEqual(body.items[0].image_urls, [`https://sb.test/object/${good}`]);
  assert.equal('image_paths' in body.items[0], false);
  assert.equal('author' in body.items[0], false);
});

test('bài đăng: chưa có bài → danh sách rỗng; người không tồn tại → 404; tham số sai → 400', async () => {
  assert.deepEqual((await get(`/${AUTHOR}/posts`)).body, { items: [], page: 1, has_more: false });
  assert.equal((await get(`/${randomUUID()}/posts`)).status, 404);
  assert.equal((await get('/khong-phai-uuid/posts')).status, 400);
  assert.equal((await get(`/${AUTHOR}/posts?page=0`)).status, 400);
  assert.equal((await get(`/${AUTHOR}/posts?page=abc`)).status, 400);
});
