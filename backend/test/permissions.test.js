import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { makeRequireAuth, requireRole } from '../src/middleware/auth.js';
import { requireGroupManager, requireGroupMember } from '../src/middleware/group.js';
import { errorHandler } from '../src/middleware/error.js';
import { canManageGroup, canAccessGroup } from '../src/lib/permissions.js';

const G1 = '11111111-1111-4111-8111-111111111111';
const G2 = '22222222-2222-4222-8222-222222222222';

// Người dùng giả: token = tên. `memberships` khóa theo `${group}:${user}`.
const users = {
  student:   { id: 'u-student',   role: 'student' },
  admin:     { id: 'u-admin',     role: 'admin' },
  manager:   { id: 'u-manager',   role: 'student' },
  member:    { id: 'u-member',    role: 'student' },
  pending:   { id: 'u-pending',   role: 'student' },
  rejected:  { id: 'u-rejected',  role: 'student' },
  pendingMgr:{ id: 'u-pendingmgr',role: 'student' },
  locked:    { id: 'u-locked',    role: 'student', is_locked: true },
};
const memberships = {
  [`${G1}:u-manager`]:    { status: 'approved', role: 'manager' },
  [`${G1}:u-member`]:     { status: 'approved', role: 'member' },
  [`${G1}:u-pending`]:    { status: 'pending',  role: 'member' },
  [`${G1}:u-rejected`]:   { status: 'rejected', role: 'member' },
  [`${G1}:u-pendingmgr`]: { status: 'pending',  role: 'manager' },
  // manager của G1 chỉ là thành viên thường ở G2
  [`${G2}:u-manager`]:    { status: 'approved', role: 'member' },
};

const fakeDb = ({ failMemberships = false } = {}) => () => ({
  auth: {
    getClaims: async (token) => {
      const u = users[token];
      return u
        ? { data: { claims: { sub: u.id, email: `${token}@uit.edu.vn` } }, error: null }
        : { data: null, error: { message: 'invalid' } };
    },
  },
  from: (table) => {
    const f = {};
    const q = { select: () => q, eq: (k, v) => { f[k] = v; return q; } };
    q.single = async () => {
      const u = Object.values(users).find((x) => x.id === f.id);
      return { data: table === 'profiles' && u ? { id: u.id, role: u.role, is_locked: !!u.is_locked } : null };
    };
    q.maybeSingle = async () => failMemberships
      ? { data: null, error: { message: 'db down' } }
      : { data: memberships[`${f.group_id}:${f.user_id}`] ?? null, error: null };
    return q;
  },
});

async function call(token, path, opts) {
  const db = fakeDb(opts);
  const app = express();
  app.use(makeRequireAuth(db));
  app.get('/admin', requireRole('admin'), (_q, s) => s.json({ ok: true }));
  app.get('/mod', requireRole('admin', 'moderator'), (_q, s) => s.json({ ok: true }));
  app.post('/groups/:id/requests/approve', requireGroupManager({ db }), (_q, s) => s.json({ ok: true }));
  app.get('/groups/:id/feed', requireGroupMember({ db }), (_q, s) => s.json({ ok: true }));
  app.use(errorHandler);
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: path.endsWith('/approve') ? 'POST' : 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return res.status;
  } finally {
    server.close();
  }
}

test('requireAuth: thiếu/sai token => 401; chưa xác minh hoặc bị khóa => 403', async () => {
  assert.equal(await call(null, '/mod'), 401);
  assert.equal(await call('nobody', '/mod'), 401);
  assert.equal(await call('locked', '/mod'), 403);
  assert.equal(await call('locked', `/groups/${G1}/feed`), 403);
});

test('requireRole: sinh viên không vào được API admin, admin thì được', async () => {
  assert.equal(await call('student', '/admin'), 403);
  assert.equal(await call('manager', '/admin'), 403); // quản lý nhóm không phải admin
  assert.equal(await call('admin', '/admin'), 200);
  assert.equal(await call('admin', '/mod'), 200);
});

test('requireRole không có req.profile => 401 (quên requireAuth không thành 403 mập mờ)', () => {
  let err;
  requireRole('admin')({}, {}, (e) => { err = e; });
  assert.equal(err.status, 401);
});

test('requireGroupManager: chỉ quản lý đã duyệt của đúng nhóm hoặc admin', async () => {
  const p = (g) => `/groups/${g}/requests/approve`;
  assert.equal(await call('manager', p(G1)), 200);
  assert.equal(await call('admin', p(G1)), 200);
  assert.equal(await call('manager', p(G2)), 403);  // quản lý nhóm khác
  assert.equal(await call('member', p(G1)), 403);   // thành viên thường
  assert.equal(await call('pendingMgr', p(G1)), 403); // quản lý nhưng chưa được duyệt
  assert.equal(await call('pending', p(G1)), 403);
  assert.equal(await call('rejected', p(G1)), 403);
  assert.equal(await call('student', p(G1)), 403);  // không phải thành viên
  assert.equal(await call(null, p(G1)), 401);
});

test('requireGroupMember: thành viên đã duyệt hoặc admin; pending/rejected/người ngoài bị chặn', async () => {
  const p = (g) => `/groups/${g}/feed`;
  assert.equal(await call('member', p(G1)), 200);
  assert.equal(await call('manager', p(G1)), 200);
  assert.equal(await call('admin', p(G2)), 200);
  assert.equal(await call('pending', p(G1)), 403);
  assert.equal(await call('rejected', p(G1)), 403);
  assert.equal(await call('student', p(G1)), 403);
  assert.equal(await call('member', p(G2)), 403);
});

test('mã nhóm không phải UUID => 400; lỗi CSDL => 500 (không mặc định cho phép)', async () => {
  assert.equal(await call('manager', '/groups/abc/requests/approve'), 400);
  assert.equal(await call('manager', `/groups/${G1}/requests/approve`, { failMemberships: true }), 500);
});

test('quy tắc thuần: canManageGroup / canAccessGroup', () => {
  const st = { role: 'student' }, ad = { role: 'admin' }, mod = { role: 'moderator' };
  assert.equal(canManageGroup(st, { status: 'approved', role: 'manager' }), true);
  assert.equal(canManageGroup(st, { status: 'approved', role: 'member' }), false);
  assert.equal(canManageGroup(st, { status: 'pending', role: 'manager' }), false);
  assert.equal(canManageGroup(st, null), false);
  assert.equal(canManageGroup(mod, null), false);
  assert.equal(canManageGroup(ad, null), true);
  assert.equal(canAccessGroup(st, { status: 'approved', role: 'member' }), true);
  assert.equal(canAccessGroup(st, { status: 'rejected', role: 'member' }), false);
  assert.equal(canAccessGroup(undefined, undefined), false);
});
