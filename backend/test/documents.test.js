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
    document_ratings: [],
    reports: [],
    profiles: [{ id: USER, full_name: 'Người dùng thử' }, { id: OTHER, full_name: 'Nguyễn Văn B' }],
  };
  const objects = {}; // path → { size, contentType, head }
  const removed = [];

  const from = (table) => {
    const filters = [];
    let row = null;
    let op = 'select';
    let patch = null;
    let conflict = [];
    const match = (r) => filters.every(([k, v]) => (Array.isArray(v) ? v.includes(r[k]) : r[k] === v));
    const rows = () => tables[table].filter(match);
    const q = {
      select: () => q,
      eq: (k, v) => (filters.push([k, v]), q),
      in: (k, v) => (filters.push([k, v]), q),
      order: () => q,
      range: () => q,
      insert: (r) => ((row = r), (op = 'insert'), q),
      update: (p) => ((patch = p), (op = 'update'), q),
      delete: () => ((op = 'delete'), q),
      upsert: (r, opts) => {
        op = 'upsert'; row = r; conflict = opts?.onConflict?.split(',') ?? [];
        return q;
      },
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      single: async () => {
        if (op === 'update') {
          const hit = rows()[0];
          if (!hit) return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
          Object.assign(hit, patch);
          return { data: hit, error: null };
        }
        if (tables.documents.some((d) => d.file_path === row.file_path))
          return { data: null, error: { code: '23505', message: 'duplicate key' } };
        const doc = { id: randomUUID(), ...row, created_at: new Date().toISOString() };
        tables[table].push(doc);
        return { data: doc, error: null };
      },
      then: (ok, fail) => {
        if (op === 'upsert') {
          const hit = tables[table].find((r) => conflict.every((k) => r[k] === row[k]));
          if (hit) Object.assign(hit, row);
          else tables[table].push({ id: randomUUID(), ...row });
          return Promise.resolve({ data: null, error: null }).then(ok, fail);
        }
        if (op === 'delete') {
          tables[table] = tables[table].filter((r) => !match(r));
          return Promise.resolve({ data: null, error: null }).then(ok, fail);
        }
        return Promise.resolve({ data: rows(), error: null }).then(ok, fail);
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
    createSignedUrl: async (path, ttl, opts) => ({
      data: { signedUrl: `https://sb.test/object/${path}?ttl=${ttl}&download=${encodeURIComponent(opts?.download ?? '')}` },
      error: null,
    }),
    remove: async (paths) => {
      for (const p of paths) { removed.push(p); delete objects[p]; }
      return { data: [], error: null };
    },
  };

  // Hàm search_documents giả: lọc theo môn/loại tệp và từ khóa (so khớp chuỗi, không dấu).
  const rpc = async (name, args) => {
    if (name === 'increment_download') {
      const d = tables.documents.find((x) => x.id === args.p_id);
      if (d) d.download_count = (d.download_count ?? 0) + 1;
      return { data: null, error: null };
    }
    if (name !== 'search_documents') return { data: null, error: { message: 'unknown rpc' } };
    const avgOf = (id) => {
      const rs = tables.document_ratings.filter((x) => x.document_id === id);
      return rs.length ? rs.reduce((a, x) => a + x.stars, 0) / rs.length : null;
    };
    const norm = (t) => (t ?? '').replace(/đ/g, 'd').replace(/Đ/g, 'D').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const q = norm(args.p_q).trim();
    const data = tables.documents
      .filter((d) => !args.p_group || d.group_id === args.p_group)
      .filter((d) => !args.p_file_type || d.file_type === args.p_file_type)
      .filter((d) => {
        const g = tables.groups.find((x) => x.id === d.group_id);
        return !q || norm(`${d.title} ${d.description ?? ''} ${g?.name ?? ''} ${g?.code ?? ''}`).includes(q);
      })
      .sort((a, b) => (args.p_sort === 'rating'
        ? (avgOf(b.id) ?? -1) - (avgOf(a.id) ?? -1)
        : 0) || b.created_at.localeCompare(a.created_at))
      .slice(args.p_offset, args.p_offset + args.p_limit);
    return { data, error: null };
  };

  return { tables, objects, removed, from, rpc, storage: { from: () => bucket } };
}

let sb, server, base;
let role = 'student'; // vai trò của người đang gọi, đổi trong test quyền Admin

before(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: USER }; req.profile = { role }; next(); }); // thay cho requireAuth
  app.use('/api/documents', createDocumentsRouter({
    db: () => sb,
    readHead: async (_sb, path) => sb.objects[path].head,
  }));
  app.use(errorHandler);
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}/api/documents`;
});
after(() => server.close());
beforeEach(() => { sb = fakeSupabase(); role = 'student'; });

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
  const res = await fetch(`${base}/${randomUUID()}/chua-co`);
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

test('search: tìm theo tên môn hoặc mã môn, không chỉ tiêu đề', async () => {
  seedDocs();
  // COURSE = "Lập trình Web" (SE347) có 2 tài liệu; PENDING_COURSE = "CSDL" (IT004) có 1 tài liệu
  const byName = await (await fetch(base + '/?q=' + encodeURIComponent('lap trinh'))).json();
  assert.equal(byName.items.length, 2);
  const byCode = await (await fetch(base + '/?q=IT004')).json();
  assert.deepEqual(byCode.items.map((d) => d.title), ['Slide tổng quan']);
});

// ───── GET/PATCH/DELETE /:id và GET /:id/download (FR-DOC-05, FR-DOC-06) ─────

const ownDoc = (extra = {}) => {
  const doc = {
    id: randomUUID(), group_id: COURSE, uploader_id: USER, title: 'Đề cương', description: null,
    file_path: `${USER}/${randomUUID()}.pdf`, file_type: 'pdf', file_size: 100,
    created_at: new Date().toISOString(), ...extra,
  };
  sb.tables.documents.push(doc);
  return doc;
};

test('detail: trả tài liệu kèm tên người tải lên, 404 khi không có, 400 khi id sai', async () => {
  const doc = ownDoc({ uploader_id: OTHER });
  const body = await (await fetch(`${base}/${doc.id}`)).json();
  assert.equal(body.title, 'Đề cương');
  assert.equal(body.uploader_name, 'Nguyễn Văn B');
  assert.equal((await fetch(`${base}/${randomUUID()}`)).status, 404);
  assert.equal((await fetch(`${base}/khong-phai-uuid`)).status, 400);
});

test('download: trả signed URL có thời hạn và tên tệp khi tải về', async () => {
  const doc = ownDoc({ title: 'Đề: giữa kỳ' });
  const body = await (await fetch(`${base}/${doc.id}/download`)).json();
  assert.equal(body.expires_in, 60);
  assert.match(body.url, /ttl=60/);
  assert.match(body.url, /download=(.*)/);
  assert.ok(decodeURIComponent(body.url).includes('Đề_ giữa kỳ.pdf'));
});

test('edit: người tải lên sửa được; người khác bị 403', async () => {
  const mine = ownDoc();
  const res = await fetch(`${base}/${mine.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Mới' }),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).title, 'Mới');

  const theirs = ownDoc({ uploader_id: OTHER });
  const denied = await fetch(`${base}/${theirs.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'X' }),
  });
  assert.equal(denied.status, 403);
});

test('edit: body rỗng hoặc tiêu đề trống → 400', async () => {
  const doc = ownDoc();
  const send = (b) => fetch(`${base}/${doc.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b),
  });
  assert.equal((await send({})).status, 400);
  assert.equal((await send({ title: '   ' })).status, 400);
});

test('edit: xóa mô tả (client gửi description: null) → 200 và lưu null', async () => {
  const doc = ownDoc({ description: 'mô tả cũ' });
  const send = (b) => fetch(`${base}/${doc.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b),
  });

  const res = await send({ description: null });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).description, null);
  assert.equal(sb.tables.documents.find((d) => d.id === doc.id).description, null);

  // Đổi tiêu đề kèm xóa mô tả trong cùng một request.
  const both = await send({ title: 'Tiêu đề mới', description: null });
  assert.equal(both.status, 200);
  const body = await both.json();
  assert.equal(body.title, 'Tiêu đề mới');
  assert.equal(body.description, null);
});

test('delete: người tải lên xóa được bản ghi và tệp; người khác bị 403', async () => {
  const mine = ownDoc();
  sb.objects[mine.file_path] = { size: 100, contentType: 'application/pdf', head: HEADS.pdf };
  const res = await fetch(`${base}/${mine.id}`, { method: 'DELETE' });
  assert.equal(res.status, 204);
  assert.ok(!sb.tables.documents.some((d) => d.id === mine.id));
  assert.ok(sb.removed.includes(mine.file_path));

  const theirs = ownDoc({ uploader_id: OTHER });
  assert.equal((await fetch(`${base}/${theirs.id}`, { method: 'DELETE' })).status, 403);
  assert.ok(sb.tables.documents.some((d) => d.id === theirs.id));
});

test('delete: Admin xóa được tài liệu của người khác nhưng không sửa được', async () => {
  role = 'admin';
  const theirs = ownDoc({ uploader_id: OTHER });
  const edit = await fetch(`${base}/${theirs.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'X' }),
  });
  assert.equal(edit.status, 403);
  assert.equal((await fetch(`${base}/${theirs.id}`, { method: 'DELETE' })).status, 204);
  assert.ok(!sb.tables.documents.some((d) => d.id === theirs.id));
  assert.ok(sb.removed.includes(theirs.file_path));
});

// ───── Đếm lượt tải, xem trước, đánh giá, sắp xếp theo điểm (FR-DOC-07, 08, 09) ─────

test('download: mỗi lần tải xuống tăng download_count', async () => {
  const doc = ownDoc({ download_count: 0 });
  await fetch(`${base}/${doc.id}/download`);
  await fetch(`${base}/${doc.id}/download`);
  assert.equal(sb.tables.documents.find((d) => d.id === doc.id).download_count, 2);
});

test('download: bộ đếm lượt tải lỗi vẫn không chặn tải xuống', async () => {
  const doc = ownDoc({ download_count: 0 });
  sb.rpc = async () => ({ data: null, error: { message: 'function public.increment_download(uuid) does not exist' } });
  const res = await fetch(`${base}/${doc.id}/download`);
  assert.equal(res.status, 200);
  assert.match((await res.json()).url, /^https:\/\/sb\.test\//);
});

test('preview: PDF và ảnh được xem trước, loại khác → 400', async () => {
  const pdf = ownDoc();
  const pptx = ownDoc({ file_type: 'pptx' });
  assert.equal((await fetch(`${base}/${pdf.id}/preview`)).status, 200);
  assert.equal((await fetch(`${base}/${pptx.id}/preview`)).status, 400);
  const png = ownDoc({ file_type: 'png' });
  assert.equal((await fetch(`${base}/${png.id}/preview`)).status, 200);
});

test('rating: đánh giá 1–5 sao, sửa được, chi tiết hiện điểm trung bình', async () => {
  const doc = ownDoc();
  const put = (stars) => fetch(`${base}/${doc.id}/rating`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stars }),
  });
  assert.equal((await put(4)).status, 200);
  assert.equal((await put(2)).status, 200);
  assert.equal((await put(6)).status, 400);
  const body = await (await fetch(`${base}/${doc.id}`)).json();
  assert.equal(body.rating_count, 1);
  assert.equal(body.rating_avg, 2);
  assert.equal(body.my_rating, 2);
});

test('browse: sort=rating đưa tài liệu điểm cao lên đầu', async () => {
  const low = ownDoc({ title: 'Điểm thấp', created_at: '2026-01-02T00:00:00Z' });
  const high = ownDoc({ title: 'Điểm cao', created_at: '2026-01-01T00:00:00Z' });
  sb.tables.document_ratings.push(
    { document_id: low.id, user_id: OTHER, stars: 2 },
    { document_id: high.id, user_id: OTHER, stars: 5 },
  );
  const newest = await (await fetch(`${base}/?sort=newest`)).json();
  assert.equal(newest.items[0].title, 'Điểm thấp');
  const byRating = await (await fetch(`${base}/?sort=rating`)).json();
  assert.equal(byRating.items[0].title, 'Điểm cao');
});

// ───── GET /mine (Tài liệu của tôi) ─────

test('mine: chỉ trả tài liệu do chính mình tải lên', async () => {
  ownDoc({ title: 'Của tôi' });
  ownDoc({ uploader_id: OTHER, title: 'Của người khác' });
  const body = await (await fetch(`${base}/mine`)).json();
  assert.deepEqual(body.items.map((d) => d.title), ['Của tôi']);
  assert.equal(body.has_more, false);
});

test('mine: kèm điểm trung bình và số lượt đánh giá', async () => {
  const rated = ownDoc();
  sb.tables.document_ratings.push(
    { document_id: rated.id, user_id: USER, stars: 5 },
    { document_id: rated.id, user_id: OTHER, stars: 4 },
  );
  const body = await (await fetch(`${base}/mine`)).json();
  const hit = body.items.find((d) => d.id === rated.id);
  assert.equal(hit.rating_avg, 4.5);
  assert.equal(hit.rating_count, 2);
});

test('mine: page không hợp lệ → 400', async () => {
  assert.equal((await fetch(`${base}/mine?page=0`)).status, 400);
});

// ───── Báo cáo vi phạm (FR-DOC-10) ─────

const report = (id, body) => post(`/${id}/report`, body);

test('report: báo cáo tài liệu của người khác → 201, chi tiết hiện đã báo cáo', async () => {
  const doc = ownDoc({ uploader_id: OTHER });
  assert.equal((await (await fetch(`${base}/${doc.id}`)).json()).my_report_pending, false);

  const res = await report(doc.id, { reason: 'copyright', detail: '  Sao chép giáo trình  ' });
  assert.equal(res.status, 201);
  assert.equal(res.body.status, 'pending');
  const saved = sb.tables.reports[0];
  assert.deepEqual(
    { target_type: saved.target_type, target_id: saved.target_id, reporter_id: saved.reporter_id, detail: saved.detail },
    { target_type: 'document', target_id: doc.id, reporter_id: USER, detail: 'Sao chép giáo trình' },
  );
  assert.equal((await (await fetch(`${base}/${doc.id}`)).json()).my_report_pending, true);
});

test('report: báo cáo lần hai khi còn chờ xử lý → 409; đã xử lý thì báo cáo lại được', async () => {
  const doc = ownDoc({ uploader_id: OTHER });
  assert.equal((await report(doc.id, { reason: 'spam' })).status, 201);
  assert.equal((await report(doc.id, { reason: 'copyright' })).status, 409);
  assert.equal(sb.tables.reports.length, 1);

  sb.tables.reports[0].status = 'dismissed';
  assert.equal((await report(doc.id, { reason: 'copyright' })).status, 201);
});

test('report: không báo cáo được tài liệu của chính mình', async () => {
  const mine = ownDoc();
  assert.equal((await report(mine.id, { reason: 'copyright' })).status, 400);
  assert.equal(sb.tables.reports.length, 0);
});

test('report: lý do sai, thiếu mô tả khi chọn "khác", tài liệu không có → lỗi', async () => {
  const doc = ownDoc({ uploader_id: OTHER });
  assert.equal((await report(doc.id, { reason: 'khong-co' })).status, 400);
  assert.equal((await report(doc.id, {})).status, 400);
  assert.equal((await report(doc.id, { reason: 'other', detail: '   ' })).status, 400);
  assert.equal((await report(doc.id, { reason: 'spam', detail: 'x'.repeat(1001) })).status, 400);
  assert.equal((await report(randomUUID(), { reason: 'spam' })).status, 404);
  assert.equal(sb.tables.reports.length, 0);
  assert.equal((await report(doc.id, { reason: 'other', detail: 'Nội dung sai lệch' })).status, 201);
});

test('detail: đọc reports lỗi (CSDL chưa có bảng) vẫn trả chi tiết tài liệu', async () => {
  const doc = ownDoc({ uploader_id: OTHER });
  const from = sb.from;
  sb.from = (t) => (t === 'reports'
    ? { select: () => ({ eq() { return this; }, maybeSingle: async () => ({ data: null, error: { message: 'relation "reports" does not exist' } }) }) }
    : from(t));
  const res = await fetch(`${base}/${doc.id}`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).my_report_pending, false);
});
