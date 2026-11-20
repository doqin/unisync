// Kiểm thử API nhóm và thành viên (FR-GRP-01..03) với dữ liệu giả, không cần CSDL thật.
import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { createGroupsRouter } from '../src/routes/groups.js';
import { errorHandler } from '../src/middleware/error.js';

const STUDENT = randomUUID();
const MANAGER = randomUUID();
const ADMIN = randomUUID();
const PENDING_MGR = randomUUID();
const OTHER_STUDENT = randomUUID();

const G_SE347 = randomUUID();
const G_IT001 = randomUUID();
const G_MAJ_SE = randomUUID();

/** Supabase giả hỗ trợ `select`, `eq`, `in`, `order`, `insert`, `update`, `maybeSingle`, `single`. */
function fakeSupabase() {
  const tables = {
    profiles: [
      { id: STUDENT, full_name: 'Nguyễn Văn A', avatar_url: null, major: 'KTPM', school: 'UIT', year: 3, role: 'student' },
      { id: MANAGER, full_name: 'Trần Quản Lý', avatar_url: null, major: 'KTPM', school: 'UIT', year: 4, role: 'student' },
      { id: ADMIN, full_name: 'Quản Trị Viên', avatar_url: null, major: 'KTPM', school: 'UIT', year: 4, role: 'admin' },
      { id: PENDING_MGR, full_name: 'Lê Chờ Duyệt', avatar_url: null, major: 'KHMT', school: 'UIT', year: 2, role: 'student' },
      { id: OTHER_STUDENT, full_name: 'Phạm Thị B', avatar_url: null, major: 'HTTT', school: 'UIT', year: 3, role: 'student' },
    ],
    groups: [
      {
        id: G_SE347,
        type: 'course',
        code: 'SE347',
        name: 'Công nghệ Web và ứng dụng',
        description: 'Nhóm học phần Công nghệ Web và ứng dụng',
        created_at: '2026-11-18T08:00:00.000Z',
      },
      {
        id: G_IT001,
        type: 'course',
        code: 'IT001',
        name: 'Nhập môn lập trình',
        description: 'Cơ sở lập trình C++ cho sinh viên năm nhất',
        created_at: '2026-11-18T08:00:00.000Z',
      },
      {
        id: G_MAJ_SE,
        type: 'major',
        code: 'MAJ-SE',
        name: 'Kỹ thuật phần mềm',
        description: 'Nhóm ngành Kỹ thuật phần mềm UIT',
        created_at: '2026-11-18T08:00:00.000Z',
      },
    ],
    group_members: [
      {
        group_id: G_SE347,
        user_id: MANAGER,
        status: 'approved',
        role: 'manager',
        joined_at: '2026-11-18T08:05:00.000Z',
      },
      {
        group_id: G_SE347,
        user_id: OTHER_STUDENT,
        status: 'pending',
        role: 'member',
        joined_at: '2026-11-18T09:00:00.000Z',
      },
      {
        group_id: G_IT001,
        user_id: STUDENT,
        status: 'approved',
        role: 'member',
        joined_at: '2026-11-18T08:10:00.000Z',
      },
      {
        group_id: G_MAJ_SE,
        user_id: STUDENT,
        status: 'rejected',
        role: 'member',
        joined_at: '2026-11-18T08:15:00.000Z',
      },
      {
        group_id: G_SE347,
        user_id: PENDING_MGR,
        status: 'pending',
        role: 'manager',
        joined_at: '2026-11-18T09:30:00.000Z',
      },
    ],
  };

  const from = (table) => {
    const filters = [];
    let orderBy = null;
    let mode = 'select';
    let payload = null;

    const matchRows = () =>
      tables[table].filter((r) => filters.every((fn) => fn(r)));

    const execute = () => {
      if (mode === 'insert') {
        if (
          table === 'group_members' &&
          tables.group_members.some(
            (m) => m.group_id === payload.group_id && m.user_id === payload.user_id,
          )
        ) {
          return { data: null, error: { code: '23505', message: 'duplicate key' } };
        }
        const row = {
          status: 'pending',
          role: 'member',
          joined_at: new Date().toISOString(),
          ...payload,
        };
        tables[table].push(row);
        return { data: [{ ...row }], error: null };
      }

      if (mode === 'update') {
        const matched = matchRows();
        const updated = matched.map((r) => Object.assign(r, payload));
        return { data: updated.map((r) => ({ ...r })), error: null };
      }

      let rows = matchRows().map((r) => ({ ...r }));
      if (orderBy) {
        rows.sort((a, b) => String(a[orderBy] ?? '').localeCompare(String(b[orderBy] ?? ''), 'vi'));
      }
      return { data: rows, error: null };
    };

    const q = {
      select: () => q,
      eq: (k, v) => {
        filters.push((r) => r[k] === v);
        return q;
      },
      in: (k, vals) => {
        filters.push((r) => vals.includes(r[k]));
        return q;
      },
      order: (col) => {
        orderBy = col;
        return q;
      },
      insert: (row) => {
        mode = 'insert';
        payload = row;
        return q;
      },
      update: (patch) => {
        mode = 'update';
        payload = patch;
        return q;
      },
      maybeSingle: async () => {
        const res = execute();
        return { data: res.data?.[0] ?? null, error: res.error };
      },
      single: async () => {
        const res = execute();
        if (res.error) return { data: null, error: res.error };
        if (!res.data?.length) return { data: null, error: { message: 'No rows' } };
        return { data: res.data[0], error: null };
      },
      then: (resolve, reject) => Promise.resolve(execute()).then(resolve, reject),
    };
    return q;
  };

  return { tables, from };
}

let sb, server, base, currentActor;

const ACTORS = {
  student: { id: STUDENT, role: 'student' },
  manager: { id: MANAGER, role: 'student' },
  admin: { id: ADMIN, role: 'admin' },
  pendingMgr: { id: PENDING_MGR, role: 'student' },
  other: { id: OTHER_STUDENT, role: 'student' },
};

before(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: currentActor.id };
    req.profile = { id: currentActor.id, role: currentActor.role };
    next();
  });
  app.use('/api/groups', createGroupsRouter({ db: () => sb }));
  app.use(errorHandler);
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}/api/groups`;
});

after(() => server.close());

beforeEach(() => {
  sb = fakeSupabase();
  currentActor = ACTORS.student;
});

async function reqJson(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// ───── FR-GRP-01: Danh sách nhóm & chi tiết nhóm ─────

test('GET /api/groups: trả danh sách nhóm sắp xếp theo tên kèm my_status/my_role', async () => {
  const { status, body } = await reqJson('GET', '');
  assert.equal(status, 200);
  assert.equal(body.items.length, 3);
  assert.deepEqual(
    body.items.map((g) => g.code),
    ['SE347', 'MAJ-SE', 'IT001'],
  );

  const byCode = Object.fromEntries(body.items.map((g) => [g.code, g]));
  assert.equal(byCode.SE347.my_status, null);
  assert.equal(byCode.SE347.my_role, null);
  assert.equal(byCode.IT001.my_status, 'approved');
  assert.equal(byCode.IT001.my_role, 'member');
  assert.equal(byCode['MAJ-SE'].my_status, 'rejected');
});

test('GET /api/groups: lọc theo type=course và type=major', async () => {
  const courses = await reqJson('GET', '?type=course');
  assert.equal(courses.status, 200);
  assert.deepEqual(
    courses.body.items.map((g) => g.code),
    ['SE347', 'IT001'],
  );

  const majors = await reqJson('GET', '?type=major');
  assert.equal(majors.status, 200);
  assert.deepEqual(
    majors.body.items.map((g) => g.code),
    ['MAJ-SE'],
  );
});

test('GET /api/groups: tìm kiếm theo mã, tên và mô tả không dấu tiếng Việt', async () => {
  const byName = await reqJson('GET', '?q=cong+nghe+web');
  assert.equal(byName.status, 200);
  assert.deepEqual(byName.body.items.map((g) => g.code), ['SE347']);

  const byCode = await reqJson('GET', '?q=maj-se');
  assert.equal(byCode.status, 200);
  assert.deepEqual(byCode.body.items.map((g) => g.code), ['MAJ-SE']);

  const byDesc = await reqJson('GET', '?q=sinh+vien+nam+nhat');
  assert.equal(byDesc.status, 200);
  assert.deepEqual(byDesc.body.items.map((g) => g.code), ['IT001']);
});

test('GET /api/groups: từ chối type không hợp lệ (400)', async () => {
  const { status } = await reqJson('GET', '?type=club');
  assert.equal(status, 400);
});

test('GET /api/groups/:id: trả chi tiết nhóm, 404 khi không có, 400 khi UUID sai', async () => {
  const ok = await reqJson('GET', `/${G_IT001}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.code, 'IT001');
  assert.equal(ok.body.my_status, 'approved');
  assert.equal(ok.body.my_role, 'member');

  assert.equal((await reqJson('GET', `/${randomUUID()}`)).status, 404);
  assert.equal((await reqJson('GET', '/khong-hop-le')).status, 400);
});

// ───── FR-GRP-02: Gửi yêu cầu tham gia nhóm ─────

test('POST /api/groups/:id/join: tạo yêu cầu pending (201) và chặn gửi trùng (409)', async () => {
  const first = await reqJson('POST', `/${G_SE347}/join`);
  assert.equal(first.status, 201);
  assert.equal(first.body.group_id, G_SE347);
  assert.equal(first.body.user_id, STUDENT);
  assert.equal(first.body.status, 'pending');
  assert.equal(first.body.role, 'member');

  const dupPending = await reqJson('POST', `/${G_SE347}/requests`);
  assert.equal(dupPending.status, 409);

  const alreadyMember = await reqJson('POST', `/${G_IT001}/join`);
  assert.equal(alreadyMember.status, 409);
});

test('POST /api/groups/:id/join: cho phép gửi lại khi trước đó bị rejected (200) và 404 khi nhóm không tồn tại', async () => {
  const retry = await reqJson('POST', `/${G_MAJ_SE}/join`);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.status, 'pending');

  const missing = await reqJson('POST', `/${randomUUID()}/join`);
  assert.equal(missing.status, 404);
});

// ───── FR-GRP-03: Quản lý nhóm / Admin xem và duyệt yêu cầu ─────

test('GET /api/groups/:id/requests: Quản lý nhóm và Admin xem được kèm hồ sơ; lọc theo status', async () => {
  currentActor = ACTORS.manager;
  const pendingRes = await reqJson('GET', `/${G_SE347}/requests`);
  assert.equal(pendingRes.status, 200);
  assert.equal(pendingRes.body.items.length, 2);
  const firstItem = pendingRes.body.items.find((x) => x.user_id === OTHER_STUDENT);
  assert.equal(firstItem.status, 'pending');
  assert.equal(firstItem.user.full_name, 'Phạm Thị B');

  currentActor = ACTORS.admin;
  const approvedRes = await reqJson('GET', `/${G_SE347}/requests?status=approved`);
  assert.equal(approvedRes.status, 200);
  assert.equal(approvedRes.body.items.length, 1);
  assert.equal(approvedRes.body.items[0].user_id, MANAGER);
});

test('GET /api/groups/:id/requests: chặn người ngoài nhóm, member thường và manager đang pending (403)', async () => {
  currentActor = ACTORS.student; // ngoài nhóm G_SE347
  assert.equal((await reqJson('GET', `/${G_SE347}/requests`)).status, 403);
  // member thường trong G_IT001
  assert.equal((await reqJson('GET', `/${G_IT001}/requests`)).status, 403);

  currentActor = ACTORS.pendingMgr; // role=manager nhưng status=pending
  assert.equal((await reqJson('GET', `/${G_SE347}/requests`)).status, 403);
});

test('PATCH /api/groups/:id/requests/:userId: Quản lý nhóm duyệt / từ chối và Admin duyệt qua alias', async () => {
  currentActor = ACTORS.manager;
  const approve = await reqJson('PATCH', `/${G_SE347}/requests/${OTHER_STUDENT}`, { status: 'approved' });
  assert.equal(approve.status, 200);
  assert.equal(approve.body.status, 'approved');

  const stored = sb.tables.group_members.find(
    (m) => m.group_id === G_SE347 && m.user_id === OTHER_STUDENT,
  );
  assert.equal(stored.status, 'approved');

  currentActor = ACTORS.admin;
  const reject = await reqJson('PATCH', `/${G_SE347}/members/${PENDING_MGR}`, { status: 'rejected' });
  assert.equal(reject.status, 200);
  assert.equal(reject.body.status, 'rejected');
});

test('PATCH /api/groups/:id/requests/:userId: kiểm tra quyền (403), không thấy yêu cầu (404) và status sai (400)', async () => {
  currentActor = ACTORS.student;
  assert.equal(
    (await reqJson('PATCH', `/${G_SE347}/requests/${OTHER_STUDENT}`, { status: 'approved' })).status,
    403,
  );

  currentActor = ACTORS.manager;
  assert.equal(
    (await reqJson('PATCH', `/${G_SE347}/requests/${STUDENT}`, { status: 'approved' })).status,
    404,
  );
  assert.equal(
    (await reqJson('PATCH', `/${G_SE347}/requests/${OTHER_STUDENT}`, { status: 'pending' })).status,
    400,
  );
});

// ───── Fallback cho phần Sprint 3 (FR-GRP-04..06) ─────

test('các đường dẫn chưa cài đặt của module nhóm trả 501', async () => {
  const { status } = await reqJson('GET', `/${G_SE347}/posts`);
  assert.equal(status, 501);
});
