// Kiểm thử API mạng xã hội cốt lõi: bài đăng, bình luận, thích, bảng tin, theo dõi/Mutual (FR-SOC-01..05)
// với dữ liệu giả (Supabase mock), không cần CSDL thật.
import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { createPostsRouter } from '../src/routes/posts.js';
import { createFeedRouter } from '../src/routes/feed.js';
import { createFollowsRouter } from '../src/routes/follows.js';
import { errorHandler } from '../src/middleware/error.js';
import { buildAvatarPath } from '../src/lib/avatar.js';
import { MAX_POST_IMAGE_SIZE, buildPostImagePath } from '../src/lib/postImages.js';
import { HEADS } from './fixtures/heads.js';

const ALICE = randomUUID();
const BOB = randomUUID();
const CHARLIE = randomUUID();
const STRANGER = randomUUID();
const ADMIN = randomUUID();

const GROUP_SE347 = randomUUID();
const GROUP_PRIVATE = randomUUID();

/** Phân tích biểu thức PostgREST `.or(...)` mà các route social sử dụng. */
function parseOrExpr(expr) {
  const mCursor = /^created_at\.lt\.([^,]+),and\(created_at\.eq\.([^,]+),id\.lt\.([^)]+)\)$/.exec(expr);
  if (mCursor) {
    const [, ts1, ts2, id] = mCursor;
    return (r) => r.created_at < ts1 || (r.created_at === ts2 && r.id < id);
  }
  const parts = expr.match(/(\w+)\.is\.null|(\w+)\.in\.\(([^)]*)\)/g);
  if (parts) {
    const fns = parts.map((t) => {
      const isNull = /^(\w+)\.is\.null$/.exec(t);
      if (isNull) return (r) => (r[isNull[1]] ?? null) === null;
      const [, col, list] = /^(\w+)\.in\.\((.*)\)$/.exec(t);
      const vals = list ? list.split(',') : [];
      return (r) => vals.includes(r[col]);
    });
    return (r) => fns.some((fn) => fn(r));
  }
  throw new Error(`Biểu thức .or() chưa được mock hỗ trợ: ${expr}`);
}

/** Supabase giả đủ các thao tác của routes/posts.js, feed.js và follows.js. */
function fakeSupabase() {
  const tables = {
    profiles: [
      {
        id: ALICE, full_name: 'Nguyễn Đức Huy', avatar_url: buildAvatarPath(ALICE, 'png'),
        bio: 'Sinh viên KTPM', major: 'KTPM', school: 'UIT', year: 3, role: 'student',
        email: 'huy@gm.uit.edu.vn', is_locked: false,
      },
      {
        id: BOB, full_name: 'Trần Văn B', avatar_url: buildAvatarPath(BOB, 'jpg'),
        bio: null, major: 'KHMT', school: 'UIT', year: 3, role: 'student',
        email: 'bob@gm.uit.edu.vn', is_locked: false,
      },
      {
        id: CHARLIE, full_name: 'Lê Thị C', avatar_url: null,
        bio: 'Học Web', major: 'HTTT', school: 'UIT', year: 2, role: 'student',
        email: 'charlie@gm.uit.edu.vn', is_locked: false,
      },
      {
        id: STRANGER, full_name: 'Phạm Người Lạ', avatar_url: null,
        bio: null, major: 'MMT', school: 'UIT', year: 4, role: 'student',
        email: 'stranger@gm.uit.edu.vn', is_locked: false,
      },
      {
        id: ADMIN, full_name: 'Quản Trị Viên', avatar_url: null,
        bio: null, major: 'KTPM', school: 'UIT', year: 4, role: 'admin',
        email: 'admin@gm.uit.edu.vn', is_locked: false,
      },
    ],
    groups: [
      { id: GROUP_SE347, type: 'course', code: 'SE347', name: 'Công nghệ Web và ứng dụng' },
      { id: GROUP_PRIVATE, type: 'major', code: 'MAJ-SE', name: 'Kỹ thuật phần mềm' },
    ],
    group_members: [
      { group_id: GROUP_SE347, user_id: ALICE, status: 'approved', role: 'member' },
      { group_id: GROUP_SE347, user_id: BOB, status: 'pending', role: 'member' },
      { group_id: GROUP_SE347, user_id: CHARLIE, status: 'rejected', role: 'member' },
      { group_id: GROUP_PRIVATE, user_id: BOB, status: 'approved', role: 'member' },
    ],
    posts: [],
    comments: [],
    comment_reactions: [],
    likes: [],
    follows: [],
  };

  const objects = {}; // path → { size, contentType, head }
  const removed = [];
  let singleSignCalls = 0;
  let batchSignCalls = 0;
  let tick = 0;

  const from = (table) => {
    const preds = [];
    const orders = [];
    let head = false;
    let cols = null;
    let limitN = null;
    let rangeSlice = null;
    let op = 'select';
    let payload = null;
    let conflictCols = [];

    const project = (r) =>
      (cols ? Object.fromEntries(cols.filter((c) => c in r).map((c) => [c, r[c]])) : { ...r });

    const matched = () => tables[table].filter((r) => preds.every((fn) => fn(r)));

    const sortedAndSliced = () => {
      let out = matched();
      for (const [k, asc] of [...orders].reverse()) {
        out = [...out].sort((a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * (asc ? 1 : -1));
      }
      if (rangeSlice) out = out.slice(rangeSlice[0], rangeSlice[1] + 1);
      if (limitN !== null) out = out.slice(0, limitN);
      return out.map(project);
    };

    const doInsert = () => {
      if (table === 'likes') {
        const dup = tables.likes.some((l) => l.post_id === payload.post_id && l.user_id === payload.user_id);
        if (dup) return { data: null, error: { code: '23505', message: 'duplicate key' } };
        const row = { ...payload, created_at: new Date(Date.UTC(2026, 10, 22, 10, 0, ++tick)).toISOString() };
        tables.likes.push(row);
        return { data: row, error: null };
      }
      if (table === 'follows') {
        if (payload.follower_id === payload.followee_id) {
          return { data: null, error: { code: '23514', message: 'check constraint' } };
        }
        const dup = tables.follows.some(
          (f) => f.follower_id === payload.follower_id && f.followee_id === payload.followee_id,
        );
        if (dup) return { data: null, error: { code: '23505', message: 'duplicate key' } };
        const row = { ...payload, created_at: new Date(Date.UTC(2026, 10, 22, 10, 0, ++tick)).toISOString() };
        tables.follows.push(row);
        return { data: row, error: null };
      }
      const row = {
        id: randomUUID(),
        ...payload,
        created_at: payload.created_at ?? new Date(Date.UTC(2026, 10, 22, 10, 0, ++tick)).toISOString(),
      };
      tables[table].push(row);
      return { data: project(row), error: null };
    };

    const doDelete = () => {
      const toDelete = matched();
      const delSet = new Set(toDelete);
      if (table === 'comments') {
        const delIds = new Set(toDelete.map((c) => c.id));
        let added = true;
        while (added) {
          added = false;
          for (const c of tables.comments) {
            if (c.parent_id && delIds.has(c.parent_id) && !delIds.has(c.id)) {
              delIds.add(c.id);
              delSet.add(c);
              added = true;
            }
          }
        }
        tables.comment_reactions = tables.comment_reactions.filter((r) => !delIds.has(r.comment_id));
      }
      tables[table] = tables[table].filter((r) => !delSet.has(r));
      if (table === 'posts') {
        const delIds = new Set(toDelete.map((p) => p.id));
        const delComments = new Set(tables.comments.filter((c) => delIds.has(c.post_id)).map((c) => c.id));
        tables.comments = tables.comments.filter((c) => !delIds.has(c.post_id));
        tables.comment_reactions = tables.comment_reactions.filter((r) => !delComments.has(r.comment_id));
        tables.likes = tables.likes.filter((l) => !delIds.has(l.post_id));
      }
      return { data: null, error: null };
    };

    const doUpsert = () => {
      const hit = tables[table].find((r) => conflictCols.every((k) => r[k] === payload[k]));
      if (hit) {
        Object.assign(hit, payload);
        return { data: hit, error: null };
      }
      const row = { ...payload, created_at: new Date(Date.UTC(2026, 10, 22, 10, 0, ++tick)).toISOString() };
      tables[table].push(row);
      return { data: row, error: null };
    };

    const q = {
      select: (c, opts) => {
        head = Boolean(opts?.head);
        cols = c && c !== '*' ? c.split(',').map((x) => x.trim()) : null;
        return q;
      },
      eq: (k, v) => (preds.push((r) => r[k] === v), q),
      neq: (k, v) => (preds.push((r) => r[k] !== v), q),
      in: (k, v) => (preds.push((r) => v.includes(r[k])), q),
      is: (k, v) => (preds.push((r) => (r[k] ?? null) === v), q),
      lt: (k, v) => (preds.push((r) => r[k] < v), q),
      overlaps: (k, arr) => (preds.push((r) => (r[k] ?? []).some((x) => arr.includes(x))), q),
      or: (expr) => (preds.push(parseOrExpr(expr)), q),
      order: (k, { ascending = true } = {}) => (orders.push([k, ascending]), q),
      limit: (n) => ((limitN = n), q),
      range: (a, b) => ((rangeSlice = [a, b]), q),
      insert: (r) => ((op = 'insert'), (payload = r), q),
      upsert: (r, opts) => {
        op = 'upsert';
        payload = r;
        conflictCols = opts?.onConflict?.split(',').map((x) => x.trim()) ?? [];
        return q;
      },
      update: (p) => ((op = 'update'), (payload = p), q),
      delete: () => ((op = 'delete'), q),
      maybeSingle: async () => ({ data: sortedAndSliced()[0] ?? null, error: null }),
      single: async () => {
        if (op === 'insert') return doInsert();
        if (op === 'update') {
          const hit = matched()[0];
          if (!hit) return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
          Object.assign(hit, payload);
          return { data: project(hit), error: null };
        }
        const rows = sortedAndSliced();
        if (!rows.length) return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
        return { data: rows[0], error: null };
      },
      then: (ok, fail) => {
        let result;
        if (op === 'insert') result = doInsert();
        else if (op === 'upsert') result = doUpsert();
        else if (op === 'delete') result = doDelete();
        else if (head) result = { count: matched().length, data: null, error: null };
        else result = { data: sortedAndSliced(), error: null };
        return Promise.resolve(result).then(ok, fail);
      },
    };
    return q;
  };

  const bucket = {
    createSignedUploadUrl: async (path) => ({
      data: { path, token: 'tok', signedUrl: `https://sb.test/upload/${path}?token=tok` },
      error: null,
    }),
    info: async (path) =>
      (objects[path]
        ? { data: { size: objects[path].size, contentType: objects[path].contentType }, error: null }
        : { data: null, error: { message: 'Object not found' } }),
    createSignedUrl: async (path, ttl) => {
      singleSignCalls += 1;
      return { data: { signedUrl: `https://sb.test/object/${path}?ttl=${ttl}` }, error: null };
    },
    createSignedUrls: async (paths, ttl) => {
      batchSignCalls += 1;
      return {
        data: paths.map((path) => ({ path, signedUrl: `https://sb.test/object/${path}?ttl=${ttl}`, error: null })),
        error: null,
      };
    },
    remove: async (paths) => {
      for (const p of paths) {
        removed.push(p);
        delete objects[p];
      }
      return { data: [], error: null };
    },
  };

  return {
    tables,
    objects,
    removed,
    getSignStats: () => ({ singleSignCalls, batchSignCalls }),
    from,
    storage: { from: () => bucket },
  };
}

let sb, server, base;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const uid = req.headers['x-test-user'] ?? ALICE;
    const profile = sb.tables.profiles.find((p) => p.id === uid);
    req.user = { id: uid };
    req.profile = profile;
    next();
  });
  const readHead = async (_sb, path) => sb.objects[path].head;
  app.use('/api/posts', createPostsRouter({ db: () => sb, readHead }));
  app.use('/api/feed', createFeedRouter({ db: () => sb }));
  app.use('/api/follows', createFollowsRouter({ db: () => sb }));
  app.use(errorHandler);
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(() => server.close());
beforeEach(() => { sb = fakeSupabase(); });

async function req(method, path, { user = ALICE, body } = {}) {
  const headers = { 'x-test-user': user };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(base + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

/** Giả lập tải ảnh hợp lệ lên Storage cho một người dùng. */
function putImage(userId, type = 'png', overrides = {}) {
  const mimeMap = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
  const path = buildPostImagePath(userId, type);
  sb.objects[path] = {
    size: 2048,
    contentType: mimeMap[type],
    head: HEADS[type],
    ...overrides,
  };
  return path;
}

// ───────────────────── FR-SOC-01: Bài đăng & ảnh ─────────────────────

test('POST /api/posts/upload-url: cấp signed upload URL (UUID) và từ chối ảnh không hợp lệ', async () => {
  const ok = await req('POST', '/posts/upload-url', {
    body: { mime_type: 'image/webp', file_size: MAX_POST_IMAGE_SIZE },
  });
  assert.equal(ok.status, 201);
  assert.match(ok.body.path, new RegExp(`^posts/${ALICE}/[0-9a-f-]+\\.webp$`));
  assert.equal(ok.body.content_type, 'image/webp');
  assert.ok(ok.body.signed_url && ok.body.token);

  const tooBig = await req('POST', '/posts/upload-url', {
    body: { mime_type: 'image/png', file_size: MAX_POST_IMAGE_SIZE + 1 },
  });
  assert.equal(tooBig.status, 400);

  const badMime = await req('POST', '/posts/upload-url', {
    body: { mime_type: 'application/pdf', file_size: 1000 },
  });
  assert.equal(badMime.status, 400);
});

test('POST /api/posts: tạo bài văn bản và bài kèm 1–4 ảnh, trả avatar & ảnh đã ký', async () => {
  const textOnly = await req('POST', '/posts', { body: { content: 'Xin chào UniSync!' } });
  assert.equal(textOnly.status, 201);
  assert.equal(textOnly.body.content, 'Xin chào UniSync!');
  assert.deepEqual(textOnly.body.image_urls, []);
  assert.deepEqual(textOnly.body.image_paths, []);
  assert.equal(textOnly.body.like_count, 0);
  assert.equal(textOnly.body.comment_count, 0);
  assert.equal(textOnly.body.liked_by_me, false);
  assert.match(textOnly.body.author.avatar_url, /^https:\/\/sb\.test\/object\/avatars\//);
  assert.equal(textOnly.body.author.email, undefined);
  assert.equal(textOnly.body.author.role, undefined);

  const imgs = [putImage(ALICE, 'png'), putImage(ALICE, 'jpg'), putImage(ALICE, 'webp')];
  const withImgs = await req('POST', '/posts', {
    body: { content: 'Bài có 3 ảnh', image_urls: imgs },
  });
  assert.equal(withImgs.status, 201);
  assert.equal(withImgs.body.image_urls.length, 3);
  assert.deepEqual(withImgs.body.image_paths, imgs);
  assert.ok(withImgs.body.image_urls.every((u) => u.startsWith('https://sb.test/object/posts/')));

  // Chính tác giả xem lại thì có `image_paths`, còn người xem khác thì không được trả đường dẫn gốc (tránh lộ user_id)
  const authorView = await req('GET', `/posts/${withImgs.body.id}`, { user: ALICE });
  assert.deepEqual(authorView.body.image_paths, imgs);
  const viewerView = await req('GET', `/posts/${withImgs.body.id}`, { user: BOB });
  assert.equal(viewerView.status, 200);
  assert.equal(viewerView.body.image_urls.length, 3);
  assert.equal(viewerView.body.image_paths, undefined);
});

test('POST /api/posts: từ chối > 4 ảnh, nội dung trống, ảnh trùng, ảnh của người khác, ảnh giả magic bytes', async () => {
  const empty = await req('POST', '/posts', { body: { content: '   ' } });
  assert.equal(empty.status, 400);

  const five = Array.from({ length: 5 }, () => putImage(ALICE, 'png'));
  const tooMany = await req('POST', '/posts', { body: { content: '5 ảnh', image_urls: five } });
  assert.equal(tooMany.status, 400);

  const one = putImage(ALICE, 'png');
  const dup = await req('POST', '/posts', { body: { content: 'trùng', image_urls: [one, one] } });
  assert.equal(dup.status, 400);

  const bobsImg = putImage(BOB, 'png');
  const steal = await req('POST', '/posts', { body: { content: 'trộm ảnh', image_urls: [bobsImg] } });
  assert.equal(steal.status, 403);
  assert.ok(sb.objects[bobsImg], 'không được xóa ảnh của người khác');

  // Nếu có 1 ảnh hợp lệ đi kèm 1 ảnh giả magic bytes → từ chối 400 và xóa sạch cả 2 ảnh khỏi Storage
  const validSibling = putImage(ALICE, 'jpg');
  const fakeMagic = putImage(ALICE, 'png', { head: HEADS.pdf });
  const badMagic = await req('POST', '/posts', { body: { content: 'ảnh giả', image_urls: [validSibling, fakeMagic] } });
  assert.equal(badMagic.status, 400);
  assert.ok(sb.removed.includes(fakeMagic), 'phải xóa ảnh sai magic bytes khỏi kho');
  assert.ok(sb.removed.includes(validSibling), 'phải dọn luôn ảnh còn lại để tránh ảnh mồ côi');

  // Tạo thành công rồi gửi lại cùng đường dẫn ảnh → 409, không xóa ảnh bài đã lưu
  const ok = await req('POST', '/posts', { body: { content: 'ok', image_urls: [one] } });
  assert.equal(ok.status, 201);
  const reuse = await req('POST', '/posts', { body: { content: 'dùng lại', image_urls: [one] } });
  assert.equal(reuse.status, 409);
  assert.ok(sb.objects[one], 'không được xóa ảnh đang gắn ở bài đã lưu');
});

test('Bài đăng trong nhóm (FR-GRP-05): chỉ thành viên đã duyệt hoặc Admin được đăng, xem, liệt kê', async () => {
  const created = await req('POST', '/posts', {
    user: ALICE,
    body: { content: 'Bài trong nhóm SE347', group_id: GROUP_SE347 },
  });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body.group, { id: GROUP_SE347, name: 'Công nghệ Web và ứng dụng' });

  // Thành viên pending, rejected và người ngoài đều bị chặn 403
  for (const outsider of [BOB, CHARLIE, STRANGER]) {
    const pCreate = await req('POST', '/posts', {
      user: outsider,
      body: { content: 'đăng lén', group_id: GROUP_SE347 },
    });
    assert.equal(pCreate.status, 403);

    const pView = await req('GET', `/posts/${created.body.id}`, { user: outsider });
    assert.equal(pView.status, 403);

    const pList = await req('GET', `/posts?group_id=${GROUP_SE347}`, { user: outsider });
    assert.equal(pList.status, 403);
  }

  // Admin và thành viên đã duyệt xem được bình thường
  const adminView = await req('GET', `/posts/${created.body.id}`, { user: ADMIN });
  assert.equal(adminView.status, 200);
  const memberList = await req('GET', `/posts?group_id=${GROUP_SE347}`, { user: ALICE });
  assert.equal(memberList.status, 200);
  assert.equal(memberList.body.items.length, 1);

  // Nhóm không tồn tại → 404
  const missingGroup = await req('POST', '/posts', {
    user: ALICE,
    body: { content: 'nhóm ảo', group_id: randomUUID() },
  });
  assert.equal(missingGroup.status, 404);
});

test('PATCH & DELETE /api/posts/:id: phân quyền sửa/xóa và dọn ảnh cũ trên Storage', async () => {
  const img1 = putImage(ALICE, 'png');
  const img2 = putImage(ALICE, 'jpg');
  const created = await req('POST', '/posts', {
    user: ALICE,
    body: { content: 'Bản gốc', image_urls: [img1, img2] },
  });
  const postId = created.body.id;

  // Người khác sửa → 403; body rỗng hoặc trường lạ → 400
  assert.equal((await req('PATCH', `/posts/${postId}`, { user: BOB, body: { content: 'hack' } })).status, 403);
  assert.equal((await req('PATCH', `/posts/${postId}`, { user: ALICE, body: {} })).status, 400);
  assert.equal((await req('PATCH', `/posts/${postId}`, { user: ALICE, body: { author_id: BOB } })).status, 400);
  assert.equal((await req('GET', '/posts/not-a-uuid')).status, 400);

  // Tác giả sửa nội dung, giữ img1, bỏ img2, thêm img3
  const img3 = putImage(ALICE, 'webp');
  const patched = await req('PATCH', `/posts/${postId}`, {
    user: ALICE,
    body: { content: 'Đã cập nhật', image_urls: [img1, img3] },
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.content, 'Đã cập nhật');
  assert.deepEqual(patched.body.image_paths, [img1, img3]);
  assert.ok(sb.removed.includes(img2), 'ảnh bị gỡ khỏi bài phải được xóa khỏi Storage');
  assert.ok(sb.objects[img1] && sb.objects[img3]);

  // Người khác xóa → 403
  assert.equal((await req('DELETE', `/posts/${postId}`, { user: BOB })).status, 403);

  // Admin xóa được → 204 và dọn hết ảnh còn lại
  const del = await req('DELETE', `/posts/${postId}`, { user: ADMIN });
  assert.equal(del.status, 204);
  assert.ok(sb.removed.includes(img1) && sb.removed.includes(img3));
  assert.equal((await req('GET', `/posts/${postId}`)).status, 404);
});

// ───────────────────── FR-SOC-03 & 04: Thích & Bình luận ─────────────────────

test('POST/DELETE /api/posts/:id/like: thích (idempotent), bỏ thích, đếm lượt và chặn người ngoài nhóm', async () => {
  const post = (await req('POST', '/posts', { user: ALICE, body: { content: 'Bài test like' } })).body;

  const l1 = await req('POST', `/posts/${post.id}/like`, { user: BOB });
  assert.equal(l1.status, 200);
  assert.deepEqual(l1.body, { post_id: post.id, liked_by_me: true, like_count: 1 });

  // Gọi lại lần hai không tăng trùng
  const l2 = await req('POST', `/posts/${post.id}/like`, { user: BOB });
  assert.equal(l2.status, 200);
  assert.equal(l2.body.like_count, 1);

  const l3 = await req('POST', `/posts/${post.id}/like`, { user: ALICE });
  assert.equal(l3.body.like_count, 2);

  const detail = await req('GET', `/posts/${post.id}`, { user: BOB });
  assert.equal(detail.body.like_count, 2);
  assert.equal(detail.body.liked_by_me, true);

  const unlike = await req('DELETE', `/posts/${post.id}/like`, { user: BOB });
  assert.equal(unlike.status, 200);
  assert.deepEqual(unlike.body, { post_id: post.id, liked_by_me: false, like_count: 1 });

  // Bài trong nhóm kín: người ngoài không được like
  const groupPost = (await req('POST', '/posts', {
    user: ALICE, body: { content: 'Kín', group_id: GROUP_SE347 },
  })).body;
  assert.equal((await req('POST', `/posts/${groupPost.id}/like`, { user: STRANGER })).status, 403);
});

test('Bình luận: thêm, liệt kê phân trang kèm avatar đã ký, xóa chính chủ / Admin, chặn người ngoài nhóm', async () => {
  const post = (await req('POST', '/posts', { user: ALICE, body: { content: 'Bài bình luận' } })).body;

  const c1 = await req('POST', `/posts/${post.id}/comments`, { user: BOB, body: { content: 'Bình luận 1' } });
  assert.equal(c1.status, 201);
  assert.equal(c1.body.author.full_name, 'Trần Văn B');
  assert.match(c1.body.author.avatar_url, /^https:\/\/sb\.test\/object\/avatars\//);

  const c2 = await req('POST', `/posts/${post.id}/comments`, { user: CHARLIE, body: { content: 'Bình luận 2' } });
  const c3 = await req('POST', `/posts/${post.id}/comments`, { user: ALICE, body: { content: 'Bình luận 3' } });
  assert.equal(c2.status, 201);
  assert.equal(c3.status, 201);

  const p1 = await req('GET', `/posts/${post.id}/comments?page=1&limit=2`);
  assert.equal(p1.status, 200);
  assert.deepEqual(p1.body.items.map((x) => x.content), ['Bình luận 1', 'Bình luận 2']);
  assert.equal(p1.body.has_more, true);

  const p2 = await req('GET', `/posts/${post.id}/comments?page=2&limit=2`);
  assert.deepEqual(p2.body.items.map((x) => x.content), ['Bình luận 3']);
  assert.equal(p2.body.has_more, false);

  // Tác giả bình luận sửa được; người khác (kể cả Admin) không được sửa; rỗng/trường lạ → 400
  const editedC1 = await req('PATCH', `/posts/${post.id}/comments/${c1.body.id}`, {
    user: BOB,
    body: { content: 'Bình luận 1 (đã sửa)' },
  });
  assert.equal(editedC1.status, 200);
  assert.equal(editedC1.body.content, 'Bình luận 1 (đã sửa)');
  assert.equal(editedC1.body.author.full_name, 'Trần Văn B');
  assert.equal(
    (await req('PATCH', `/posts/${post.id}/comments/${c1.body.id}`, { user: ALICE, body: { content: 'hack' } })).status,
    403,
  );
  assert.equal(
    (await req('PATCH', `/posts/${post.id}/comments/${c1.body.id}`, { user: ADMIN, body: { content: 'admin' } })).status,
    403,
  );
  assert.equal(
    (await req('PATCH', `/posts/${post.id}/comments/${c1.body.id}`, { user: BOB, body: { content: '  ' } })).status,
    400,
  );
  assert.equal(
    (await req('PATCH', `/posts/${post.id}/comments/${c1.body.id}`, { user: BOB, body: { content: 'ok', author_id: ALICE } })).status,
    400,
  );

  // Chủ bài không có quyền xóa bình luận của người khác (chỉ tác giả bình luận hoặc Admin)
  assert.equal((await req('DELETE', `/posts/${post.id}/comments/${c1.body.id}`, { user: ALICE })).status, 403);
  // Chính chủ xóa được
  assert.equal((await req('DELETE', `/posts/${post.id}/comments/${c1.body.id}`, { user: BOB })).status, 204);
  // Admin xóa được bình luận vi phạm
  assert.equal((await req('DELETE', `/posts/${post.id}/comments/${c2.body.id}`, { user: ADMIN })).status, 204);

  const detail = await req('GET', `/posts/${post.id}`);
  assert.equal(detail.body.comment_count, 1);

  // Xóa bình luận sai postId → 404
  const otherPost = (await req('POST', '/posts', { user: ALICE, body: { content: 'Bài khác' } })).body;
  assert.equal((await req('DELETE', `/posts/${otherPost.id}/comments/${c3.body.id}`, { user: ALICE })).status, 404);

  // Bài nhóm kín: người ngoài không xem/thêm bình luận được
  const groupPost = (await req('POST', '/posts', {
    user: ALICE, body: { content: 'Nhóm kín', group_id: GROUP_SE347 },
  })).body;
  assert.equal((await req('GET', `/posts/${groupPost.id}/comments`, { user: STRANGER })).status, 403);
  assert.equal(
    (await req('POST', `/posts/${groupPost.id}/comments`, { user: STRANGER, body: { content: 'lén' } })).status,
    403,
  );
});

test('Bình luận phản hồi dạng cây (parent_id): trả lời nhiều cấp, chặn parent ở bài khác và xóa cha xóa luôn con', async () => {
  const post = (await req('POST', '/posts', { user: ALICE, body: { content: 'Bài test reply tree' } })).body;
  const otherPost = (await req('POST', '/posts', { user: ALICE, body: { content: 'Bài khác' } })).body;

  const root = (await req('POST', `/posts/${post.id}/comments`, {
    user: ALICE, body: { content: 'Bình luận gốc' },
  })).body;
  assert.equal(root.parent_id, null);

  // Trả lời cấp 1 và cấp 2
  const r1 = await req('POST', `/posts/${post.id}/comments`, {
    user: BOB, body: { content: '@Nguyễn Đức Huy đồng ý', parent_id: root.id },
  });
  assert.equal(r1.status, 201);
  assert.equal(r1.body.parent_id, root.id);

  const r2 = await req('POST', `/posts/${post.id}/comments`, {
    user: CHARLIE, body: { content: '@Trần Văn B chuẩn luôn', parent_id: r1.body.id },
  });
  assert.equal(r2.status, 201);
  assert.equal(r2.body.parent_id, r1.body.id);

  // Không cho gắn parent_id thuộc bài đăng khác → 404
  const crossPost = await req('POST', `/posts/${otherPost.id}/comments`, {
    user: BOB, body: { content: 'trả lời nhầm bài', parent_id: root.id },
  });
  assert.equal(crossPost.status, 404);

  // Danh sách bình luận giữ đúng parent_id
  const list = await req('GET', `/posts/${post.id}/comments?page=1&limit=20`);
  assert.equal(list.body.items.length, 3);
  assert.equal(list.body.items.find((x) => x.id === r1.body.id).parent_id, root.id);
  assert.equal(list.body.items.find((x) => x.id === r2.body.id).parent_id, r1.body.id);

  // Xóa bình luận gốc → cascade xóa cả r1 và r2
  assert.equal((await req('DELETE', `/posts/${post.id}/comments/${root.id}`, { user: ALICE })).status, 204);
  const afterDel = await req('GET', `/posts/${post.id}/comments?page=1&limit=20`);
  assert.equal(afterDel.body.items.length, 0);
});

test('Cảm xúc bình luận (PUT/DELETE reaction): thả, đổi loại, bỏ cảm xúc, thống kê và chặn người ngoài nhóm', async () => {
  const post = (await req('POST', '/posts', { user: ALICE, body: { content: 'Bài test reaction' } })).body;
  const cmt = (await req('POST', `/posts/${post.id}/comments`, {
    user: ALICE, body: { content: 'Bình luận hay' },
  })).body;
  assert.equal(cmt.reaction_count, 0);
  assert.equal(cmt.my_reaction, null);

  // Bob thả love, Charlie thả haha
  const r1 = await req('PUT', `/posts/${post.id}/comments/${cmt.id}/reaction`, {
    user: BOB, body: { reaction: 'love' },
  });
  assert.equal(r1.status, 200);
  assert.deepEqual(r1.body, {
    comment_id: cmt.id,
    my_reaction: 'love',
    reaction_count: 1,
    reaction_counts: { love: 1 },
  });

  // Bob đổi sang haha (không tăng trùng)
  const r1Change = await req('PUT', `/posts/${post.id}/comments/${cmt.id}/reaction`, {
    user: BOB, body: { reaction: 'haha' },
  });
  assert.equal(r1Change.status, 200);
  assert.equal(r1Change.body.my_reaction, 'haha');
  assert.equal(r1Change.body.reaction_count, 1);

  await req('PUT', `/posts/${post.id}/comments/${cmt.id}/reaction`, {
    user: CHARLIE, body: { reaction: 'love' },
  });

  // Lấy danh sách bình luận thấy đủ thống kê + my_reaction đúng theo người xem
  const listBob = await req('GET', `/posts/${post.id}/comments`, { user: BOB });
  assert.equal(listBob.body.items[0].reaction_count, 2);
  assert.equal(listBob.body.items[0].my_reaction, 'haha');
  assert.deepEqual(listBob.body.items[0].reaction_counts, { haha: 1, love: 1 });

  const listAlice = await req('GET', `/posts/${post.id}/comments`, { user: ALICE });
  assert.equal(listAlice.body.items[0].my_reaction, null);

  // Bob bỏ cảm xúc
  const delReact = await req('DELETE', `/posts/${post.id}/comments/${cmt.id}/reaction`, { user: BOB });
  assert.equal(delReact.status, 200);
  assert.deepEqual(delReact.body, {
    comment_id: cmt.id,
    my_reaction: null,
    reaction_count: 1,
    reaction_counts: { love: 1 },
  });

  // Loại cảm xúc lạ → 400; bài nhóm kín → 403
  assert.equal(
    (await req('PUT', `/posts/${post.id}/comments/${cmt.id}/reaction`, { user: BOB, body: { reaction: 'fire' } })).status,
    400,
  );
  const groupPost = (await req('POST', '/posts', {
    user: ALICE, body: { content: 'Nhóm kín', group_id: GROUP_SE347 },
  })).body;
  const groupCmt = (await req('POST', `/posts/${groupPost.id}/comments`, {
    user: ALICE, body: { content: 'trong nhóm' },
  })).body;
  assert.equal(
    (await req('PUT', `/posts/${groupPost.id}/comments/${groupCmt.id}/reaction`, { user: STRANGER, body: { reaction: 'like' } })).status,
    403,
  );
});

// ───────────────────── FR-SOC-02: Bảng tin cursor ─────────────────────

test('GET /api/feed: chỉ hiện bài cá nhân của mình + người theo dõi, sắp xếp mới nhất và phân trang cursor không trùng/sót', async () => {
  // Alice theo dõi Bob, không theo dõi Stranger
  await req('POST', `/follows/${BOB}`, { user: ALICE });

  // Cố tình tạo 2 bài cùng mốc created_at để kiểm tra tie-breaker theo id
  const sameTime = '2026-11-22T12:00:00.000Z';
  const idLow = '00000000-0000-4000-8000-000000000001';
  const idHigh = '00000000-0000-4000-8000-000000000002';
  sb.tables.posts.push(
    { id: randomUUID(), author_id: ALICE, group_id: null, content: 'Cũ nhất (Alice)', image_urls: [], created_at: '2026-11-22T11:00:00.000Z' },
    { id: idLow, author_id: BOB, group_id: null, content: 'Cùng giờ - id nhỏ (Bob)', image_urls: [], created_at: sameTime },
    { id: idHigh, author_id: ALICE, group_id: null, content: 'Cùng giờ - id lớn (Alice)', image_urls: [], created_at: sameTime },
    { id: randomUUID(), author_id: BOB, group_id: null, content: 'Mới nhất (Bob)', image_urls: [], created_at: '2026-11-22T13:00:00.000Z' },
    // Bài của người lạ và bài nhóm kín của Bob phải KHÔNG xuất hiện trên bảng tin trang chủ
    { id: randomUUID(), author_id: STRANGER, group_id: null, content: 'Bài người lạ', image_urls: [], created_at: '2026-11-22T14:00:00.000Z' },
    { id: randomUUID(), author_id: BOB, group_id: GROUP_PRIVATE, content: 'Bài nhóm kín của Bob', image_urls: [], created_at: '2026-11-22T14:30:00.000Z' },
  );

  // Trang 1 (limit=2) → [Mới nhất (Bob), Cùng giờ - id lớn (Alice)]
  const page1 = await req('GET', '/feed?limit=2', { user: ALICE });
  assert.equal(page1.status, 200);
  assert.deepEqual(
    page1.body.items.map((p) => p.content),
    ['Mới nhất (Bob)', 'Cùng giờ - id lớn (Alice)'],
  );
  assert.equal(page1.body.has_more, true);
  assert.ok(page1.body.next_cursor);

  // Trang 2 dùng cursor → không sót bài cùng giờ id nhỏ!
  const page2 = await req('GET', `/feed?limit=2&cursor=${encodeURIComponent(page1.body.next_cursor)}`, { user: ALICE });
  assert.equal(page2.status, 200);
  assert.deepEqual(
    page2.body.items.map((p) => p.content),
    ['Cùng giờ - id nhỏ (Bob)', 'Cũ nhất (Alice)'],
  );
  assert.equal(page2.body.has_more, false);
  assert.equal(page2.body.next_cursor, null);

  // Cursor dạng ISO thuần cũng hoạt động; cursor sai định dạng → 400
  const isoPage = await req('GET', `/feed?cursor=${encodeURIComponent(sameTime)}`, { user: ALICE });
  assert.equal(isoPage.status, 200);
  assert.deepEqual(isoPage.body.items.map((p) => p.content), ['Cũ nhất (Alice)']);

  assert.equal((await req('GET', '/feed?cursor=invalid-cursor', { user: ALICE })).status, 400);
});

// ───────────────────── FR-SOC-05: Theo dõi & Mutual ─────────────────────

test('Follow & Mutual: một chiều, hai chiều thành Mutual, bỏ theo dõi mất Mutual, chặn tự follow', async () => {
  // Không cho tự theo dõi chính mình
  assert.equal((await req('POST', `/follows/${ALICE}`, { user: ALICE })).status, 400);
  assert.equal((await req('DELETE', `/follows/${ALICE}`, { user: ALICE })).status, 400);
  // Người dùng không tồn tại → 404
  assert.equal((await req('POST', `/follows/${randomUUID()}`, { user: ALICE })).status, 404);

  // Alice theo dõi Bob → 1 chiều (is_mutual = false)
  const f1 = await req('POST', `/follows/${BOB}`, { user: ALICE });
  assert.equal(f1.status, 201);
  assert.deepEqual(f1.body, {
    user_id: BOB,
    is_self: false,
    is_following: true,
    is_followed_by: false,
    is_mutual: false,
    followers_count: 1,
    following_count: 0,
  });

  // Gọi lại lần nữa (idempotent → 200)
  const f1Again = await req('POST', `/follows/${BOB}`, { user: ALICE });
  assert.equal(f1Again.status, 200);
  assert.equal(f1Again.body.followers_count, 1);

  // Bob theo dõi lại Alice → Mutual!
  const f2 = await req('POST', `/follows/${ALICE}`, { user: BOB });
  assert.equal(f2.status, 201);
  assert.equal(f2.body.is_following, true);
  assert.equal(f2.body.is_followed_by, true);
  assert.equal(f2.body.is_mutual, true);

  // Kiểm tra trạng thái từ phía Alice
  const st = await req('GET', `/follows/${BOB}/status`, { user: ALICE });
  assert.equal(st.status, 200);
  assert.equal(st.body.is_mutual, true);
  assert.equal(st.body.followers_count, 1);
  assert.equal(st.body.following_count, 1);

  // Danh sách followers/following kèm avatar đã ký và trạng thái Mutual
  await req('POST', `/follows/${ALICE}`, { user: CHARLIE });
  const followers = await req('GET', `/follows/${ALICE}/followers?page=1&limit=10`, { user: ALICE });
  assert.equal(followers.status, 200);
  assert.equal(followers.body.items.length, 2);
  const bobItem = followers.body.items.find((u) => u.id === BOB);
  const charlieItem = followers.body.items.find((u) => u.id === CHARLIE);
  assert.equal(bobItem.is_mutual, true);
  assert.match(bobItem.avatar_url, /^https:\/\/sb\.test\/object\/avatars\//);
  assert.equal(bobItem.email, undefined);
  assert.equal(charlieItem.is_mutual, false);
  assert.equal(charlieItem.is_followed_by, true);
  assert.equal(charlieItem.is_following, false);

  const following = await req('GET', `/follows/${ALICE}/following`, { user: ALICE });
  assert.equal(following.status, 200);
  assert.deepEqual(following.body.items.map((u) => u.id), [BOB]);

  // Alice bỏ theo dõi Bob → không còn Mutual
  const unfollow = await req('DELETE', `/follows/${BOB}`, { user: ALICE });
  assert.equal(unfollow.status, 200);
  assert.equal(unfollow.body.is_following, false);
  assert.equal(unfollow.body.is_followed_by, true);
  assert.equal(unfollow.body.is_mutual, false);
  assert.equal(unfollow.body.followers_count, 0);
});

test('GET /api/posts?author_id=...: ẩn bài nhóm kín với người ngoài nhưng hiện với thành viên đã duyệt và Admin', async () => {
  await req('POST', '/posts', { user: ALICE, body: { content: 'Cá nhân Alice' } });
  await req('POST', '/posts', { user: ALICE, body: { content: 'Nhóm SE347 Alice', group_id: GROUP_SE347 } });

  const byStranger = await req('GET', `/posts?author_id=${ALICE}`, { user: STRANGER });
  assert.equal(byStranger.status, 200);
  assert.deepEqual(byStranger.body.items.map((p) => p.content), ['Cá nhân Alice']);

  const byAlice = await req('GET', `/posts?author_id=${ALICE}`, { user: ALICE });
  assert.equal(byAlice.status, 200);
  assert.equal(byAlice.body.items.length, 2);

  const byAdmin = await req('GET', `/posts?author_id=${ALICE}`, { user: ADMIN });
  assert.equal(byAdmin.status, 200);
  assert.equal(byAdmin.body.items.length, 2);
});

test('Edge cases: trường lạ bị strictObject chặn, ảnh chưa upload/quá lớn/lỗi quyền nhóm được xử lý sạch, ký avatar theo lô', async () => {
  // Trường lạ (vd. gõ nhầm `images` thay vì `image_urls` hoặc cố chèn `author_id`) → 400
  assert.equal((await req('POST', '/posts', { body: { content: 'hi', images: [] } })).status, 400);
  assert.equal((await req('POST', '/posts', { body: { content: 'hi', author_id: BOB } })).status, 400);

  // Ảnh chưa tải lên Storage → 400
  const missingPath = buildPostImagePath(ALICE, 'png');
  assert.equal((await req('POST', '/posts', { body: { content: 'ảnh chưa up', image_urls: [missingPath] } })).status, 400);

  // Ảnh trên Storage vượt quá 1 MB → 400 và tự xóa mà không cần đọc magic bytes
  const bigPath = putImage(ALICE, 'png', { size: MAX_POST_IMAGE_SIZE + 10, head: undefined });
  assert.equal((await req('POST', '/posts', { body: { content: 'ảnh lớn', image_urls: [bigPath] } })).status, 400);
  assert.ok(sb.removed.includes(bigPath));

  // Đăng bài vào nhóm kín khi không có quyền → 403 và dọn ảnh mới tải lên
  const orphanPath = putImage(STRANGER, 'jpg');
  const blocked = await req('POST', '/posts', {
    user: STRANGER,
    body: { content: 'lén đăng ảnh', group_id: GROUP_SE347, image_urls: [orphanPath] },
  });
  assert.equal(blocked.status, 403);
  assert.ok(sb.removed.includes(orphanPath));

  // GET /api/posts (không lọc) chỉ trả bài cá nhân, ẩn bài nhóm, và ký avatar theo lô (không gọi createSignedUrl lẻ)
  await req('POST', '/posts', { user: ALICE, body: { content: 'Công khai 1' } });
  await req('POST', '/posts', { user: BOB, body: { content: 'Công khai 2' } });
  await req('POST', '/posts', { user: ALICE, body: { content: 'Nhóm SE347', group_id: GROUP_SE347 } });

  const beforeStats = sb.getSignStats();
  const pub = await req('GET', '/posts?limit=10', { user: STRANGER });
  const afterStats = sb.getSignStats();
  assert.equal(pub.status, 200);
  assert.equal(pub.body.items.length, 2);
  assert.equal(afterStats.singleSignCalls, beforeStats.singleSignCalls, 'không được gọi ký từng avatar lẻ');
  assert.equal(afterStats.batchSignCalls - beforeStats.batchSignCalls, 1, 'ký tất cả avatar trong 1 lần gọi lô');

  // Trạng thái tự xem chính mình ở /api/follows/:self/status và phân trang followers
  const selfStatus = await req('GET', `/follows/${ALICE}/status`, { user: ALICE });
  assert.equal(selfStatus.status, 200);
  assert.equal(selfStatus.body.is_self, true);
  assert.equal(selfStatus.body.is_mutual, false);

  await req('POST', `/follows/${ALICE}`, { user: BOB });
  await req('POST', `/follows/${ALICE}`, { user: CHARLIE });
  const fPage1 = await req('GET', `/follows/${ALICE}/followers?page=1&limit=1`, { user: ALICE });
  assert.equal(fPage1.status, 200);
  assert.equal(fPage1.body.items.length, 1);
  assert.equal(fPage1.body.has_more, true);
  const fPage2 = await req('GET', `/follows/${ALICE}/followers?page=2&limit=1`, { user: ALICE });
  assert.equal(fPage2.body.items.length, 1);
  assert.equal(fPage2.body.has_more, false);
});
