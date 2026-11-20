// Kiểm thử luồng tải lên 4 bước với Supabase giả (nhóm/thành viên giả), không cần CSDL thật.
import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { createDocumentsRouter } from '../src/routes/documents.js';
import { errorHandler } from '../src/middleware/error.js';
import { buildStoragePath, MAX_DOCUMENT_SIZE } from '../src/lib/files.js';
import { HEADS } from './fixtures/heads.js';

const USER = randomUUID();
const OTHER = randomUUID();
const COURSE = randomUUID();
const PENDING_COURSE = randomUUID();
const OUTSIDE_COURSE = randomUUID();
const MAJOR = randomUUID();

/** Supabase giả: đủ các hàm mà routes/documents.js dùng. */
function fakeSupabase() {
  const tables = {
    groups: [
      { id: COURSE, type: 'course', name: 'Lập trình Web', code: 'SE347' },
      { id: PENDING_COURSE, type: 'course', name: 'CSDL', code: 'IT004' },
      { id: OUTSIDE_COURSE, type: 'course', name: 'Mạng', code: 'IT005' },
      { id: MAJOR, type: 'major', name: 'KTPM', code: null },
    ],
    group_members: [
      { group_id: COURSE, user_id: USER, status: 'approved' },
      { group_id: PENDING_COURSE, user_id: USER, status: 'pending' },
      { group_id: MAJOR, user_id: USER, status: 'approved' },
    ],
    documents: [],
  };
  const objects = {}; // path → { size, contentType, head }
  const removed = [];

  const from = (table) => {
    const filters = [];
    let row = null;
    const rows = () => tables[table].filter((r) => filters.every(([k, v]) => (Array.isArray(v) ? v.includes(r[k]) : r[k] === v)));
    const q = {
      select: () => q,
      eq: (k, v) => (filters.push([k, v]), q),
      in: (k, v) => (filters.push([k, v]), q),
      order: () => q,
      then: (ok, fail) => Promise.resolve({ data: rows(), error: null }).then(ok, fail),
      insert: (r) => ((row = r), q),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      single: async () => {
        if (tables.documents.some((d) => d.file_path === row.file_path))
          return { data: null, error: { code: '23505', message: 'duplicate key' } };
        const doc = { id: randomUUID(), ...row, created_at: new Date().toISOString() };
        tables[table].push(doc);
        return { data: doc, error: null };
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
    remove: async (paths) => {
      for (const p of paths) { removed.push(p); delete objects[p]; }
      return { data: [], error: null };
    },
  };

  // Hàm search_documents giả: lọc theo môn/loại tệp và từ khóa (so khớp chuỗi, không dấu).
  const rpc = async (name, args) => {
    if (name !== 'search_documents') return { data: null, error: { message: 'unknown rpc' } };
    const norm = (t) => (t ?? '').replace(/đ/g, 'd').replace(/Đ/g, 'D').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const q = norm(args.p_q).trim();
    const data = tables.documents
      .filter((d) => !args.p_group || d.group_id === args.p_group)
      .filter((d) => !args.p_file_type || d.file_type === args.p_file_type)
      .filter((d) => !q || norm(`${d.title} ${d.description ?? ''}`).includes(q))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(args.p_offset, args.p_offset + args.p_limit);
    return { data, error: null };
  };

  return { tables, objects, removed, from, rpc, storage: { from: () => bucket } };
}

let sb, server, base;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: USER }; next(); }); // thay cho requireAuth
  app.use('/api/documents', createDocumentsRouter({
    db: () => sb,
    readHead: async (_sb, path) => sb.objects[path].head,
  }));
  app.use(errorHandler);
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}/api/documents`;
});
after(() => server.close());
beforeEach(() => { sb = fakeSupabase(); });

const post = async (path, body) => {
  const res = await fetch(base + path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

const meta = { group_id: COURSE, title: 'Đề thi giữa kỳ SE347', description: 'Có đáp án' };
const declared = { ...meta, file_name: 'de-thi.pdf', mime_type: 'application/pdf', file_size: 2048 };

/** Bước 1–3: xin URL rồi "tải lên" một tệp giả. */
async function uploadFake(object = { size: 2048, contentType: 'application/pdf', head: HEADS.pdf }) {
  const { body } = await post('/upload-url', declared);
  sb.objects[body.path] = object;
  return body.path;
}

// ───── GET /my-groups ─────

test('my-groups: chỉ trả nhóm học phần đã được duyệt', async () => {
  const res = await fetch(base + '/my-groups');
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).map((g) => g.id), [COURSE]);
});

test('my-groups: chưa tham gia nhóm nào → mảng rỗng', async () => {
  sb.tables.group_members = [];
  const res = await fetch(base + '/my-groups');
  assert.deepEqual(await res.json(), []);
});

// ───── Bước 1–2: POST /upload-url ─────

test('upload-url: thành viên đã duyệt nhận signed upload URL, tên tệp là UUID', async () => {
  const { status, body } = await post('/upload-url', declared);
  assert.equal(status, 201);
  assert.match(body.path, new RegExp(`^${USER}/[0-9a-f-]{36}\\.pdf$`));
  assert.equal(body.token, 'tok');
  assert.ok(body.signed_url);
  assert.equal(body.content_type, 'application/pdf');
});

test('upload-url: trả MIME chuẩn kể cả khi trình duyệt không biết MIME', async () => {
  const { status, body } = await post('/upload-url', { ...declared, file_name: 'slide.PPTX', mime_type: '' });
  assert.equal(status, 201);
  assert.match(body.path, /\.pptx$/);
  assert.equal(body.content_type, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
});

test('upload-url: từ chối khi không phải thành viên đã duyệt hoặc nhóm không hợp lệ', async () => {
  assert.equal((await post('/upload-url', { ...declared, group_id: PENDING_COURSE })).status, 403);
  assert.equal((await post('/upload-url', { ...declared, group_id: OUTSIDE_COURSE })).status, 403);
  assert.equal((await post('/upload-url', { ...declared, group_id: MAJOR })).status, 400);
  assert.equal((await post('/upload-url', { ...declared, group_id: randomUUID() })).status, 404);
});

test('upload-url: từ chối loại tệp, MIME, kích thước sai và dữ liệu thiếu', async () => {
  const cases = [
    { file_name: 'virus.exe', mime_type: 'application/x-msdownload' },
    { file_name: 'trang.pdf', mime_type: 'text/html' },
    { file_size: MAX_DOCUMENT_SIZE + 1 },
    { file_size: 0 },
    { title: '   ' },
    { group_id: 'khong-phai-uuid' },
    { file_size: undefined },
  ];
  for (const c of cases) {
    const { status } = await post('/upload-url', { ...declared, ...c });
    assert.equal(status, 400, JSON.stringify(c));
  }
});

// ───── Bước 4: POST / (xác nhận) ─────

test('xác nhận: tệp hợp lệ → ghi documents với kích thước thật từ Storage', async () => {
  const path = await uploadFake({ size: 3000, contentType: 'application/pdf', head: HEADS.pdf });
  const { status, body } = await post('/', { ...meta, path });
  assert.equal(status, 201);
  assert.equal(body.file_path, path);
  assert.equal(body.file_type, 'pdf');
  assert.equal(body.file_size, 3000);
  assert.equal(body.uploader_id, USER);
  assert.equal(body.group_id, COURSE);
  assert.equal(body.title, meta.title);
  assert.equal(sb.tables.documents.length, 1);
  assert.deepEqual(sb.removed, []);
});

test('xác nhận: mô tả rỗng lưu thành null', async () => {
  const path = await uploadFake();
  const { body } = await post('/', { ...meta, description: '  ', path });
  assert.equal(body.description, null);
});

test('xác nhận: nội dung không khớp loại tệp → xóa tệp', async () => {
  const path = await uploadFake({ size: 2048, contentType: 'application/pdf', head: HEADS.png });
  const { status } = await post('/', { ...meta, path });
  assert.equal(status, 400);
  assert.deepEqual(sb.removed, [path]);
  assert.equal(sb.tables.documents.length, 0);
});

test('xác nhận: MIME đã lưu sai hoặc tệp quá lớn → xóa tệp', async () => {
  for (const obj of [
    { size: 2048, contentType: 'text/html', head: HEADS.pdf },
    { size: MAX_DOCUMENT_SIZE + 1, contentType: 'application/pdf', head: HEADS.pdf },
  ]) {
    sb = fakeSupabase();
    const path = await uploadFake(obj);
    assert.equal((await post('/', { ...meta, path })).status, 400);
    assert.deepEqual(sb.removed, [path]);
  }
});

test('xác nhận: chưa tải tệp lên → 400', async () => {
  const { body } = await post('/upload-url', declared);
  assert.equal((await post('/', { ...meta, path: body.path })).status, 400);
  assert.equal(sb.tables.documents.length, 0);
});

test('xác nhận: tệp của người khác → 403, không đụng tới tệp', async () => {
  const path = buildStoragePath(OTHER, 'pdf');
  sb.objects[path] = { size: 2048, contentType: 'application/pdf', head: HEADS.pdf };
  assert.equal((await post('/', { ...meta, path })).status, 403);
  assert.deepEqual(sb.removed, []);
});

test('xác nhận: đường dẫn sai định dạng → 400', async () => {
  for (const path of ['../etc/passwd', `${USER}/de-thi.pdf`, `${USER}/${randomUUID()}.exe`])
    assert.equal((await post('/', { ...meta, path })).status, 400, path);
});

test('xác nhận: không còn là thành viên → 403 và xóa tệp', async () => {
  const path = await uploadFake();
  assert.equal((await post('/', { ...meta, group_id: OUTSIDE_COURSE, path })).status, 403);
  assert.deepEqual(sb.removed, [path]);
});

test('xác nhận: gọi lại lần hai → 409, không xóa tệp của tài liệu đã ghi', async () => {
  const path = await uploadFake();
  assert.equal((await post('/', { ...meta, path })).status, 201);
  assert.equal((await post('/', { ...meta, path })).status, 409);
  assert.equal((await post('/', { ...meta, group_id: OUTSIDE_COURSE, path })).status, 409);
  assert.deepEqual(sb.removed, []);
  assert.equal(sb.tables.documents.length, 1);
});

test('các đường dẫn chưa cài đặt của module trả 501', async () => {
  const res = await fetch(`${base}/${randomUUID()}`);
  assert.equal(res.status, 501);
});

// ───── GET /subjects và GET / (duyệt, tìm kiếm) ─────

test('subjects: trả mọi nhóm học phần, không trả ngành', async () => {
  const res = await fetch(base + '/subjects');
  const list = await res.json();
  assert.equal(res.status, 200);
  assert.ok(list.every((g) => g.id !== MAJOR));
  assert.ok(list.some((g) => g.id === COURSE));
});

const seedDocs = () => {
  const mk = (title, extra) => ({
    id: randomUUID(), group_id: COURSE, uploader_id: OTHER, description: null,
    file_path: `${OTHER}/${randomUUID()}.pdf`, file_type: 'pdf', file_size: 100,
    created_at: new Date().toISOString(), title, ...extra,
  });
  sb.tables.documents.push(
    mk('Đề thi giữa kỳ'),
    mk('Bài giảng chương 2', { file_type: 'pptx', file_path: `${OTHER}/${randomUUID()}.pptx` }),
    mk('Slide tổng quan', { group_id: PENDING_COURSE }),
  );
};

test('browse: không lọc → trả mọi tài liệu, có phân trang', async () => {
  seedDocs();
  const body = await (await fetch(base + '/?page=1')).json();
  assert.equal(body.items.length, 3);
  assert.equal(body.has_more, false);
});

test('browse: lọc theo môn và loại tệp', async () => {
  seedDocs();
  const byGroup = await (await fetch(`${base}/?group_id=${COURSE}`)).json();
  assert.equal(byGroup.items.length, 2);
  const byType = await (await fetch(`${base}/?group_id=${COURSE}&file_type=pptx`)).json();
  assert.deepEqual(byType.items.map((d) => d.title), ['Bài giảng chương 2']);
});

test('search: từ khóa không dấu khớp tiêu đề có dấu', async () => {
  seedDocs();
  const body = await (await fetch(base + '/?q=' + encodeURIComponent('de thi'))).json();
  assert.deepEqual(body.items.map((d) => d.title), ['Đề thi giữa kỳ']);
});

test('browse: tham số không hợp lệ → 400', async () => {
  const res = await fetch(`${base}/?file_type=exe&page=0`);
  assert.equal(res.status, 400);
});
