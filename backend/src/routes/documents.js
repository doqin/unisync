// Thư viện tài liệu (FR-DOC-*) – phụ trách: Đức Trọng (ImDT06).
//
// Luồng tải lên 4 bước (SRS 3.5, 6.1). Tệp KHÔNG đi qua Express (giới hạn body 4,5 MB của Vercel):
//   1. Client gửi metadata:   POST /api/documents/upload-url
//        { group_id, title, description?, file_name, mime_type?, file_size }
//   2. Express kiểm tra thành viên đã duyệt của nhóm học phần, phần mở rộng/MIME, kích thước ≤ 10 MB
//      → 201 { path, token, signed_url, content_type }
//   3. Client tải thẳng lên Storage, bọc tệp lại với MIME chuẩn do bước 2 trả về:
//        const body = new Blob([file], { type: content_type });
//        supabase.storage.from('documents').uploadToSignedUrl(path, token, body)
//      (Với Blob/File, supabase-js BỎ QUA option `contentType` và dùng `file.type`; trình duyệt có thể để
//      `file.type` rỗng với DOCX/PPTX → bucket từ chối "application/octet-stream is not supported".)
//   4. Client xác nhận:         POST /api/documents
//        { path, group_id, title, description? }
//      Express kiểm tra tệp thật (kích thước, MIME, magic bytes), sai thì xóa tệp; đúng thì ghi `documents`
//      → 201 <bản ghi documents>
//
// Express không lưu gì giữa bước 2 và 4: đường dẫn có dạng `<user_id>/<uuid>.<loại>` nên bước 4 tự
// kiểm tra được tệp là của người đang gọi.
import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { badRequest, forbidden, HttpError, notFound } from '../lib/errors.js';
import {
  DOCUMENT_TYPES, DOCUMENTS_BUCKET, HEAD_BYTES, buildStoragePath, checkDeclaredFile, checkStoredFile, parseStoragePath,
} from '../lib/files.js';
import { validate } from '../middleware/validate.js';
import { uploadLimiter } from '../middleware/rateLimit.js';
import { stub } from './_stub.js';

const meta = {
  group_id: z.uuid('Nhóm học phần không hợp lệ'),
  title: z.string().trim().min(1, 'Nhập tiêu đề').max(200, 'Tiêu đề tối đa 200 ký tự'),
  description: z.string().trim().max(2000, 'Mô tả tối đa 2000 ký tự').optional()
    .transform((v) => v || null),
};

const uploadUrlSchema = z.object({
  ...meta,
  file_name: z.string().trim().min(1).max(255),
  mime_type: z.string().max(255).optional(),
  file_size: z.number().int(),
});

const browseSchema = z.object({
  group_id: z.uuid('Môn học không hợp lệ').optional(),
  file_type: z.enum(Object.keys(DOCUMENT_TYPES), { message: 'Loại tệp không hợp lệ' }).optional(),
  q: z.string().trim().max(200, 'Từ khóa tối đa 200 ký tự').optional(),
  sort: z.enum(['newest', 'rating'], { message: 'Cách sắp xếp không hợp lệ' }).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

const idParam = z.object({ id: z.uuid('Tài liệu không hợp lệ') });

const mineSchema = z.object({ page: z.coerce.number().int().min(1).max(1000).default(1) });

const editSchema = z.object({
  title: z.string().trim().min(1, 'Nhập tiêu đề').max(200, 'Tiêu đề tối đa 200 ký tự').optional(),
  // `.nullish()` (không phải `.optional()`): client gửi `description: null` khi người dùng xóa hết mô tả.
  description: z.string().trim().max(2000, 'Mô tả tối đa 2000 ký tự').nullish()
    .transform((v) => (v === undefined ? undefined : v || null)),
}).refine((b) => Object.keys(b).length > 0, { message: 'Không có thông tin nào để sửa' });

const ratingSchema = z.object({ stars: z.number().int().min(1, 'Số sao từ 1 đến 5').max(5, 'Số sao từ 1 đến 5') });

// Lý do báo cáo vi phạm (FR-DOC-10); khớp ràng buộc `reports.reason` ở migration 0008.
export const REPORT_REASONS = ['copyright', 'inappropriate', 'spam', 'other'];

const reportSchema = z.object({
  reason: z.enum(REPORT_REASONS, { message: 'Lý do báo cáo không hợp lệ' }),
  detail: z.string().trim().max(1000, 'Mô tả tối đa 1000 ký tự').optional()
    .transform((v) => v || null),
}).refine((b) => b.reason !== 'other' || b.detail, { message: 'Hãy mô tả vi phạm', path: ['detail'] });

const DOWNLOAD_TTL = 60; // giây
const PREVIEW_TYPES = ['pdf', 'png', 'jpg', 'webp']; // loại tệp xem trước được (FR-DOC-09 mở rộng cho ảnh)

/** Lấy tài liệu theo id, 404 nếu không có. */
async function loadDocument(sb, id) {
  const { data, error } = await sb.from('documents').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw notFound('Không tìm thấy tài liệu');
  return data;
}

/** Điểm trung bình (làm tròn 1 chữ số) và số lượt đánh giá. */
function summarizeRatings(ratings) {
  const count = ratings.length;
  const sum = ratings.reduce((a, x) => a + x.stars, 0);
  return { rating_avg: count ? Math.round((sum / count) * 10) / 10 : null, rating_count: count };
}

/** Gắn điểm đánh giá cho một trang danh sách (FR-DOC-08). Lỗi thì trả danh sách không kèm điểm. */
async function withRatings(sb, docs) {
  if (!docs.length) return docs;
  const { data, error } = await sb.from('document_ratings').select('document_id, stars')
    .in('document_id', docs.map((d) => d.id));
  if (error) {
    console.error('Đọc document_ratings thất bại:', error.message);
    return docs;
  }
  return docs.map((d) => ({ ...d, ...summarizeRatings(data.filter((x) => x.document_id === d.id)) }));
}

/** Tên tệp khi người dùng tải về: tiêu đề + phần mở rộng thật. */
const downloadName = (doc) => `${doc.title.replace(/[\/:*?"<>|]/g, '_').slice(0, 150)}.${doc.file_type}`;

const confirmSchema = z.object({
  ...meta,
  path: z.string().max(255),
});

/** Đọc vài byte đầu của tệp trên Storage qua signed URL ngắn hạn (không tải cả tệp vào bộ nhớ). */
async function readHeadFromStorage(sb, path) {
  const { data, error } = await sb.storage.from(DOCUMENTS_BUCKET).createSignedUrl(path, 60);
  if (error) throw error;
  const res = await fetch(data.signedUrl, { headers: { Range: `bytes=0-${HEAD_BYTES - 1}` } });
  if (!res.ok) throw new Error(`Không đọc được tệp (${res.status})`);
  const reader = res.body.getReader();
  const chunks = [];
  let len = 0;
  while (len < HEAD_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    len += value.length;
  }
  await reader.cancel().catch(() => {});
  return Buffer.concat(chunks).subarray(0, HEAD_BYTES);
}

/** Nhóm phải là nhóm học phần và người dùng là thành viên đã duyệt (FR-DOC-01). */
async function assertCourseMember(sb, groupId, userId) {
  const { data: group, error } = await sb.from('groups').select('id, type').eq('id', groupId).maybeSingle();
  if (error) throw error;
  if (!group) throw notFound('Không tìm thấy nhóm');
  if (group.type !== 'course') throw badRequest('Tài liệu chỉ đăng trong nhóm học phần');

  const { data: member, error: mErr } = await sb.from('group_members').select('status')
    .eq('group_id', groupId).eq('user_id', userId).maybeSingle();
  if (mErr) throw mErr;
  if (member?.status !== 'approved') throw forbidden('Bạn chưa là thành viên đã duyệt của nhóm này');
}

/**
 * @param {object} [deps] thay thế khi test (Supabase giả).
 * @param {() => any} [deps.db] trả về client Supabase service_role.
 * @param {(sb: any, path: string) => Promise<Uint8Array>} [deps.readHead]
 */
export function createDocumentsRouter({ db = supabaseAdmin, readHead = readHeadFromStorage } = {}) {
  const r = Router();

  // Nhóm học phần mà người dùng có thể đăng tài liệu (thành viên đã duyệt), cho form tải lên.
  r.get('/my-groups', async (req, res, next) => {
    try {
      const sb = db();
      const { data: members, error } = await sb.from('group_members').select('group_id')
        .eq('user_id', req.user.id).eq('status', 'approved');
      if (error) throw error;
      const ids = members.map((m) => m.group_id);
      if (!ids.length) return res.json([]);
      const { data: groups, error: gErr } = await sb.from('groups').select('id, name, code')
        .in('id', ids).eq('type', 'course').order('name');
      if (gErr) throw gErr;
      res.json(groups);
    } catch (e) {
      next(e);
    }
  });

  // Bước 1–2: cấp signed upload URL.
  r.post('/upload-url', uploadLimiter, validate({ body: uploadUrlSchema }), async (req, res, next) => {
    try {
      const { group_id, file_name, mime_type, file_size } = req.body;
      const check = checkDeclaredFile({ fileName: file_name, mimeType: mime_type, size: file_size });
      if (!check.ok) throw badRequest(check.error);

      const sb = db();
      await assertCourseMember(sb, group_id, req.user.id);

      const path = buildStoragePath(req.user.id, check.fileType);
      const { data, error } = await sb.storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(path);
      if (error) throw error;
      res.status(201).json({ path: data.path, token: data.token, signed_url: data.signedUrl, content_type: check.mime });
    } catch (e) {
      next(e);
    }
  });

  // Bước 4: xác nhận và ghi bản ghi tài liệu.
  r.post('/', validate({ body: confirmSchema }), async (req, res, next) => {
    try {
      const { path, group_id, title, description } = req.body;
      const parsed = parseStoragePath(path);
      if (!parsed) throw badRequest('Đường dẫn tệp không hợp lệ');
      if (parsed.userId !== req.user.id) throw forbidden('Tệp không thuộc về bạn');

      const sb = db();
      // Kiểm tra trùng TRƯỚC mọi thao tác xóa, để không bao giờ xóa tệp của tài liệu đã ghi.
      const { data: existing, error: exErr } = await sb.from('documents').select('id')
        .eq('file_path', path).maybeSingle();
      if (exErr) throw exErr;
      if (existing) throw new HttpError(409, 'Tài liệu này đã được xác nhận');

      const discard = async (err) => {
        await sb.storage.from(DOCUMENTS_BUCKET).remove([path]).catch(() => {});
        throw err;
      };

      try {
        await assertCourseMember(sb, group_id, req.user.id);
      } catch (e) {
        await discard(e);
      }

      const { data: info, error: infoErr } = await sb.storage.from(DOCUMENTS_BUCKET).info(path);
      if (infoErr || !info) throw badRequest('Chưa thấy tệp trên kho lưu trữ, hãy tải lên trước');

      const head = await readHead(sb, path);
      const fileError = checkStoredFile(parsed.fileType, { size: info.size, contentType: info.contentType, head });
      if (fileError) await discard(badRequest(fileError));

      const { data: doc, error: insErr } = await sb.from('documents').insert({
        group_id, uploader_id: req.user.id, title, description,
        file_path: path, file_type: parsed.fileType, file_size: info.size,
      }).select().single();
      if (insErr?.code === '23505') throw new HttpError(409, 'Tài liệu này đã được xác nhận');
      if (insErr) throw insErr;
      res.status(201).json(doc);
    } catch (e) {
      next(e);
    }
  });

  // Danh sách môn học (nhóm học phần) để duyệt theo môn (FR-DOC-03).
  r.get('/subjects', async (_req, res, next) => {
    try {
      const { data, error } = await db().from('groups').select('id, name, code')
        .eq('type', 'course').order('name');
      if (error) throw error;
      res.json(data);
    } catch (e) {
      next(e);
    }
  });

  // Duyệt và tìm kiếm tài liệu (FR-DOC-03, FR-DOC-04): lọc theo môn, loại tệp, từ khóa không dấu.
  r.get('/', validate({ query: browseSchema }), async (req, res, next) => {
    try {
      const { group_id, file_type, q } = req.query; // đã kiểm tra bởi browseSchema
      const page = Number(req.query.page ?? 1);
      const limit = 20;
      const sb = db();
      const { data, error } = await sb.rpc('search_documents', {
        p_q: q ?? null, p_group: group_id ?? null, p_file_type: file_type ?? null,
        p_sort: req.query.sort === 'rating' ? 'rating' : 'newest',
        p_limit: limit, p_offset: (page - 1) * limit,
      });
      if (error) throw error;
      res.json({ items: await withRatings(sb, data), page, has_more: data.length === limit });
    } catch (e) {
      next(e);
    }
  });

  // Tài liệu do chính người dùng tải lên. Truy vấn đơn giản trên bảng documents, không dùng hàm tìm kiếm.
  r.get('/mine', validate({ query: mineSchema }), async (req, res, next) => {
    try {
      const limit = 20;
      const page = Number(req.query.page ?? 1);
      const sb = db();
      const { data, error } = await sb.from('documents').select('*')
        .eq('uploader_id', req.user.id).order('created_at', { ascending: false })
        .range((page - 1) * limit, page * limit - 1);
      if (error) throw error;
      res.json({ items: await withRatings(sb, data), page, has_more: data.length === limit });
    } catch (e) {
      next(e);
    }
  });

  // Chi tiết một tài liệu (FR-DOC-05, FR-DOC-06).
  r.get('/:id', validate({ params: idParam }), async (req, res, next) => {
    try {
      const sb = db();
      const doc = await loadDocument(sb, req.params.id);
      // Tên người tải lên: hồ sơ hiển thị cho mọi sinh viên đã đăng nhập (SRS 2.4.2, RLS profiles_select).
      const { data: uploader, error: upErr } = await sb.from('profiles').select('full_name')
        .eq('id', doc.uploader_id).maybeSingle();
      if (upErr) throw upErr;
      const { data: ratings, error } = await sb.from('document_ratings').select('user_id, stars')
        .eq('document_id', doc.id);
      if (error) throw error;
      const { data: myReport, error: repErr } = await sb.from('reports').select('id')
        .eq('target_type', 'document').eq('target_id', doc.id)
        .eq('reporter_id', req.user.id).eq('status', 'pending').maybeSingle();
      // Báo cáo vi phạm là tính năng phụ (FR-DOC-10): lỗi hoặc CSDL chưa có bảng `reports` thì ghi nhật ký,
      // không được chặn trang chi tiết.
      if (repErr) console.error('Đọc reports thất bại:', repErr.message);
      res.json({
        ...doc,
        uploader_name: uploader?.full_name ?? null,
        ...summarizeRatings(ratings),
        my_rating: ratings.find((x) => x.user_id === req.user.id)?.stars ?? null,
        my_report_pending: Boolean(myReport),
      });
    } catch (e) {
      next(e);
    }
  });

  // Tải xuống bằng signed URL có thời hạn ngắn (FR-DOC-05, NFR-06). Bucket không công khai.
  r.get('/:id/download', validate({ params: idParam }), async (req, res, next) => {
    try {
      const doc = await loadDocument(db(), req.params.id);
      const { data, error } = await db().storage.from(DOCUMENTS_BUCKET)
        .createSignedUrl(doc.file_path, DOWNLOAD_TTL, { download: downloadName(doc) });
      if (error) throw error;
      const { error: incErr } = await db().rpc('increment_download', { p_id: doc.id });
      // Bộ đếm lượt tải chỉ là tính năng phụ (FR-DOC-07): lỗi hoặc chưa có hàm trên CSDL thì ghi nhật ký,
      // không được chặn việc tải xuống (FR-DOC-05).
      if (incErr) console.error('increment_download thất bại:', incErr.message);
      res.json({ url: data.signedUrl, expires_in: DOWNLOAD_TTL });
    } catch (e) {
      next(e);
    }
  });

  // Người tải lên sửa tiêu đề/mô tả (FR-DOC-06).
  r.patch('/:id', validate({ params: idParam, body: editSchema }), async (req, res, next) => {
    try {
      const sb = db();
      const doc = await loadDocument(sb, req.params.id);
      if (doc.uploader_id !== req.user.id) throw forbidden('Chỉ người tải lên mới sửa được tài liệu này');
      const { data, error } = await sb.from('documents').update(req.body).eq('id', doc.id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) {
      next(e);
    }
  });

  // Người tải lên xóa tài liệu của mình; Admin xóa tài liệu vi phạm (FR-DOC-06).
  r.delete('/:id', validate({ params: idParam }), async (req, res, next) => {
    try {
      const sb = db();
      const doc = await loadDocument(sb, req.params.id);
      const isAdmin = req.profile?.role === 'admin';
      if (doc.uploader_id !== req.user.id && !isAdmin) throw forbidden('Bạn không có quyền xóa tài liệu này');
      const { error } = await sb.from('documents').delete().eq('id', doc.id);
      if (error) throw error;
      // Xóa tệp sau khi đã xóa bản ghi; nếu lỗi thì tệp mồ côi, không ảnh hưởng dữ liệu hiển thị.
      await sb.storage.from(DOCUMENTS_BUCKET).remove([doc.file_path]).catch(() => {});
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  // Xem trước PDF và ảnh ngay trên trang (FR-DOC-09): signed URL không ép tải về.
  r.get('/:id/preview', validate({ params: idParam }), async (req, res, next) => {
    try {
      const doc = await loadDocument(db(), req.params.id);
      if (!PREVIEW_TYPES.includes(doc.file_type)) throw badRequest('Chỉ xem trước được tệp PDF hoặc ảnh');
      const { data, error } = await db().storage.from(DOCUMENTS_BUCKET).createSignedUrl(doc.file_path, DOWNLOAD_TTL);
      if (error) throw error;
      res.json({ url: data.signedUrl, expires_in: DOWNLOAD_TTL });
    } catch (e) {
      next(e);
    }
  });

  // Đánh giá 1–5 sao, mỗi người một đánh giá cho một tài liệu (FR-DOC-08).
  r.put('/:id/rating', validate({ params: idParam, body: ratingSchema }), async (req, res, next) => {
    try {
      const sb = db();
      const doc = await loadDocument(sb, req.params.id);
      const { error } = await sb.from('document_ratings').upsert(
        { document_id: doc.id, user_id: req.user.id, stars: req.body.stars },
        { onConflict: 'document_id,user_id' },
      );
      if (error) throw error;
      res.json({ my_rating: req.body.stars });
    } catch (e) {
      next(e);
    }
  });

  // Báo cáo tài liệu vi phạm (FR-DOC-10). Ghi vào bảng `reports` dùng chung; Admin xử lý ở hàng đợi (FR-ADM-04).
  r.post('/:id/report', validate({ params: idParam, body: reportSchema }), async (req, res, next) => {
    try {
      const sb = db();
      const doc = await loadDocument(sb, req.params.id);
      if (doc.uploader_id === req.user.id) throw badRequest('Không thể báo cáo tài liệu của chính bạn');

      const DUP = 'Bạn đã báo cáo tài liệu này, quản trị viên đang xem xét';
      const { data: pending, error: pErr } = await sb.from('reports').select('id')
        .eq('target_type', 'document').eq('target_id', doc.id)
        .eq('reporter_id', req.user.id).eq('status', 'pending').maybeSingle();
      if (pErr) throw pErr;
      if (pending) throw new HttpError(409, DUP);

      const { data, error } = await sb.from('reports').insert({
        target_type: 'document', target_id: doc.id, reporter_id: req.user.id,
        reason: req.body.reason, detail: req.body.detail, status: 'pending',
      }).select('id, reason, status, created_at').single();
      // Hai yêu cầu đồng thời: chỉ mục duy nhất `reports_one_pending` chặn bản thứ hai.
      if (error?.code === '23505') throw new HttpError(409, DUP);
      if (error) throw error;
      res.status(201).json(data);
    } catch (e) {
      next(e);
    }
  });

  // Phần còn lại của module chưa cài đặt.
  r.use(stub('Thư viện tài liệu', 'FR-DOC-03..10', 'Đức Trọng'));
  return r;
}

export default createDocumentsRouter();
