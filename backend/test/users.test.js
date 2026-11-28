// Kiểm thử API tìm/gợi ý người dùng (FR-SOC-06) với Supabase giả, không cần CSDL thật.
import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { createUsersRouter } from '../src/routes/users.js';
import { errorHandler } from '../src/middleware/error.js';
import { buildAvatarPath } from '../src/lib/avatar.js';

const ME = randomUUID();
const TRONG = randomUUID();
const TRANG = randomUUID();
const HUY = randomUUID();
const LOCKED = randomUUID();

const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

/** Supabase giả: bảng profiles/follows, hàm search_users (bật/tắt), ký URL ảnh. */
function fakeSupabase({ hasRpc = true } = {}) {
  const day = (d) => new Date(Date.UTC(2026, 10, d)).toISOString();
  const tables = {
    profiles: [
      { id: ME, full_name: 'Nguyễn Minh Trọng', avatar_url: null, is_locked: false, created_at: day(1) },
      { id: TRONG, full_name: 'Lê Đức Trọng', avatar_url: buildAvatarPath(TRONG, 'png'), is_locked: false, created_at: day(2) },
      { id: TRANG, full_name: 'Trần Thu Trang', avatar_url: null, is_locked: false, created_at: day(3) },
      { id: HUY, full_name: 'Nguyễn Đức Huy', avatar_url: null, is_locked: false, created_at: day(4) },
      { id: LOCKED, full_name: 'Trọng Bị Khóa', avatar_url: null, is_locked: true, created_at: day(5) },
    ],
    follows: [],
  };
  const rpcCalls = [];

  const from = (table) => {
    const preds = [];
    const orders = [];
    let range = null;
    let limitN = null;
    const run = () => {
      let out = tables[table].filter((r) => preds.every((fn) => fn(r)));
      for (const [k, asc] of [...orders].reverse()) {
        out = [...out].sort((a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * (asc ? 1 : -1));
      }
      if (range) out = out.slice(range[0], range[1] + 1);
      if (limitN !== null) out = out.slice(0, limitN);
      return out.map((r) => ({ ...r }));
    };
    const q = {
      select: () => q,
      eq: (k, v) => (preds.push((r) => r[k] === v), q),
      neq: (k, v) => (preds.push((r) => r[k] !== v), q),
      in: (k, v) => (preds.push((r) => v.includes(r[k])), q),
      not: (k, op, list) => {
        assert.equal(op, 'in');
        const vals = list.slice(1, -1).split(',');
        preds.push((r) => !vals.includes(r[k]));
        return q;
      },
      ilike: (k, pattern) => {
        const needle = pattern.slice(1, -1).replace(/\\(.)/g, '$1').toLowerCase();
        preds.push((r) => r[k].toLowerCase().includes(needle));
        return q;
      },
      order: (k, { ascending = true } = {}) => (orders.push([k, ascending]), q),
      range: (a, b) => ((range = [a, b]), q),
      limit: (n) => ((limitN = n), q),
      then: (ok, fail) => Promise.resolve({ data: run(), error: null }).then(ok, fail),
    };
    return q;
  };

  const rpc = async (name, args) => {
    rpcCalls.push({ name, args });
    if (!hasRpc) return { data: null, error: { code: 'PGRST202', message: 'function not found' } };
    if (name === 'suggest_users') {
      const me = tables.profiles.find((p) => p.id === args.p_viewer);
      const myFollowing = tables.follows.filter((f) => f.follower_id === args.p_viewer).map((f) => f.followee_id);
      const rows = tables.profiles
        .filter((p) => !p.is_locked && p.id !== args.p_viewer && !myFollowing.includes(p.id))
        .map((p) => {
          const fm = tables.follows.some((f) => f.follower_id === p.id && f.followee_id === args.p_viewer);
          const mc = tables.follows.filter((f) => f.followee_id === p.id && myFollowing.includes(f.follower_id)).length;
          const sm = Boolean(p.major && p.major === me.major);
          const ss = Boolean(p.school && p.school === me.school);
          const score = (fm ? 4 : 0) + Math.min(mc, 3) + (sm ? 2 : 0) + (ss ? 1 : 0);
          return { p, score, fm, mc, sm, ss };
        })
        .sort((a, b) => b.score - a.score || (a.p.created_at < b.p.created_at ? 1 : -1))
        .slice(args.p_offset, args.p_offset + args.p_limit)
        .map(({ p, fm, mc, sm, ss }) => ({
          id: p.id, full_name: p.full_name, avatar_url: p.avatar_url, major: p.major, school: p.school,
          follows_me: fm, mutual_count: mc, same_major: sm, same_school: ss,
        }));
      return { data: rows, error: null };
    }
    const needle = strip(args.p_q.trim());
    const rows = tables.profiles
      .filter((p) => !p.is_locked && p.id !== args.p_exclude && strip(p.full_name).includes(needle))
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
      .slice(args.p_offset, args.p_offset + args.p_limit)
      .map(({ id, full_name, avatar_url }) => ({ id, full_name, avatar_url }));
    return { data: rows, error: null };
  };

  const bucket = {
    createSignedUrls: async (paths) => ({
      data: paths.map((path) => ({ path, signedUrl: `https://sb.test/${path}`, error: null })),
      error: null,
    }),
  };

  return { tables, rpcCalls, from, rpc, storage: { from: () => bucket } };
}

let sb, server, base;

before(async () => {
  const app = express();
  app.use((req, _res, next) => { req.user = { id: ME }; next(); });
  app.use('/api/users', createUsersRouter({ db: () => sb }));
  app.use(errorHandler);
  await new Promise((ok) => { server = app.listen(0, ok); });
  base = `http://127.0.0.1:${server.address().port}/api/users`;
});
after(() => server.close());
beforeEach(() => { sb = fakeSupabase(); });

const get = async (qs = '') => {
  const res = await fetch(`${base}${qs}`);
  return { status: res.status, body: await res.json() };
};

test('tìm không dấu, bỏ chính mình và tài khoản bị khóa', async () => {
  const r = await get('?q=trong');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.items.map((u) => u.id), [TRONG]);
  assert.equal(sb.rpcCalls[0].args.p_exclude, ME);
});

test('gắn trạng thái theo dõi / Mutual và ký URL ảnh đại diện', async () => {
  sb.tables.follows.push({ follower_id: ME, followee_id: TRONG }, { follower_id: TRONG, followee_id: ME });
  sb.tables.follows.push({ follower_id: HUY, followee_id: ME });
  const r = await get('?q=Đức');
  const byId = Object.fromEntries(r.body.items.map((u) => [u.id, u]));
  assert.deepEqual(
    [byId[TRONG].is_following, byId[TRONG].is_followed_by, byId[TRONG].is_mutual],
    [true, true, true],
  );
  assert.deepEqual([byId[HUY].is_following, byId[HUY].is_followed_by, byId[HUY].is_mutual], [false, true, false]);
  assert.match(byId[TRONG].avatar_url, /^https:\/\/sb\.test\//);
});

test('phân trang: has_more và trang kế tiếp', async () => {
  const p1 = await get('?q=n&limit=1');
  assert.equal(p1.body.items.length, 1);
  assert.equal(p1.body.has_more, true);
  const p2 = await get('?q=n&limit=1&page=2');
  assert.notEqual(p2.body.items[0].id, p1.body.items[0].id);
});

test('không có q → gợi ý người chưa theo dõi; hòa điểm thì mới tham gia trước', async () => {
  sb.tables.follows.push({ follower_id: ME, followee_id: HUY });
  const r = await get();
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.items.map((u) => u.id), [TRANG, TRONG]);
  assert.equal(sb.rpcCalls[0].name, 'suggest_users');
  assert.equal(sb.rpcCalls[0].args.p_viewer, ME);
});

test('gợi ý ưu tiên người theo dõi mình > bạn của bạn > cùng ngành, kèm lý do', async () => {
  const p = (id) => sb.tables.profiles.find((x) => x.id === id);
  Object.assign(p(ME), { major: 'KTPM', school: 'UIT' });
  Object.assign(p(TRONG), { major: 'KTPM', school: 'UIT' }); // cùng ngành + trường: 3 điểm
  const EXTRA = randomUUID();
  sb.tables.profiles.push({ id: EXTRA, full_name: 'Bạn Của Huy', avatar_url: null, is_locked: false, created_at: '2026-11-06' });
  sb.tables.follows.push(
    { follower_id: TRANG, followee_id: ME }, // Trang theo dõi mình: 4 điểm
    { follower_id: ME, followee_id: HUY },
    { follower_id: HUY, followee_id: EXTRA }, // người mình theo dõi cũng theo dõi EXTRA: 1 điểm
  );
  const r = await get();
  assert.deepEqual(r.body.items.map((u) => u.id), [TRANG, TRONG, EXTRA]);
  const [trang, trong, extra] = r.body.items;
  assert.equal(trang.reason.follows_me, true);
  assert.equal(trang.is_followed_by, true);
  assert.deepEqual([trong.reason.same_major, trong.reason.same_school], [true, true]);
  assert.equal(extra.reason.mutual_count, 1);
});

test('DB chưa có hàm suggest_users → gợi ý theo cách cũ, không có lý do', async () => {
  sb = fakeSupabase({ hasRpc: false });
  sb.tables.follows.push({ follower_id: ME, followee_id: HUY });
  const r = await get();
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.items.map((u) => u.id), [TRANG, TRONG]);
  assert.equal(r.body.items[0].reason, undefined);
});

test('DB chưa có hàm search_users → dùng ilike', async () => {
  sb = fakeSupabase({ hasRpc: false });
  const r = await get('?q=trang');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.items.map((u) => u.id), [TRANG]);
});

test('từ khóa quá dài → 400', async () => {
  const r = await get(`?q=${'a'.repeat(101)}`);
  assert.equal(r.status, 400);
});
