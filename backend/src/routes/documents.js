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
  DOCUMENTS_BUCKET, HEAD_BYTES, buildStoragePath, checkDeclaredFile, checkStoredFile, parseStoragePath,
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

  // Phần còn lại của module (duyệt, tìm kiếm, tải xuống, sửa/xóa: #25–#27) chưa cài đặt.
  r.use(stub('Thư viện tài liệu', 'FR-DOC-03..10', 'Đức Trọng'));
  return r;
}

export default createDocumentsRouter();
