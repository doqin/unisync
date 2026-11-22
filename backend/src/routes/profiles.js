// Hồ sơ cá nhân (FR-PRO-*) – phụ trách: Khang (doqin).
//
// Đổi ảnh đại diện theo luồng 3 bước (SRS 3.5), ảnh KHÔNG đi qua Express (giới hạn body 4,5 MB của Vercel):
//   1. POST /api/profiles/me/avatar-url  { mime_type, file_size }
//      → 201 { path, token, signed_url, content_type }
//   2. Client nén ảnh ≤ 1 MB rồi tải thẳng lên Storage, bọc Blob với `content_type` ở bước 1:
//        supabase.storage.from('images').uploadToSignedUrl(path, token, blob)
//   3. POST /api/profiles/me/avatar  { path }
//      Express kiểm tra ảnh thật (kích thước, MIME, magic bytes), sai thì xóa; đúng thì ghi `avatar_url`
//      và xóa ảnh cũ → 200 <hồ sơ>
// Express không lưu gì giữa bước 1 và 3: đường dẫn `avatars/<user_id>/<uuid>.<loại>` tự cho biết chủ ảnh.
import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { badRequest, forbidden } from '../lib/errors.js';
import { HEAD_BYTES } from '../lib/files.js';
import {
  IMAGES_BUCKET, buildAvatarPath, checkDeclaredAvatar, checkStoredAvatar, parseAvatarPath, signAvatar,
} from '../lib/avatar.js';
import { validate } from '../middleware/validate.js';
import { uploadLimiter } from '../middleware/rateLimit.js';
import { stub } from './_stub.js';

// Ô văn bản không bắt buộc: client gửi '' hoặc null để xóa → lưu null.
const optionalText = (label, max) => z.string().trim().max(max, `${label} tối đa ${max} ký tự`).nullish()
  .transform((v) => (v === undefined ? undefined : v || null));

// `.strict()`: trường lạ (đặc biệt `role`, `is_locked`) bị từ chối thay vì lặng lẽ bỏ qua (FR-PRO-02).
const profileSchema = z.strictObject({
  full_name: z.string().trim().min(2, 'Họ tên tối thiểu 2 ký tự').max(100, 'Họ tên tối đa 100 ký tự').optional(),
  bio: optionalText('Giới thiệu', 500),
  major: optionalText('Ngành', 100),
  school: optionalText('Trường', 150),
  year: z.number().int('Năm học không hợp lệ').min(1, 'Năm học từ 1 đến 8').max(8, 'Năm học từ 1 đến 8').nullish(),
}).refine((b) => Object.keys(b).length > 0, { message: 'Không có thông tin nào để sửa' });

const avatarUrlSchema = z.object({
  mime_type: z.string().max(255),
  file_size: z.number().int(),
});

const avatarConfirmSchema = z.object({ path: z.string().max(255) });

/** Đọc vài byte đầu của ảnh trên Storage qua signed URL ngắn hạn (không tải cả ảnh vào bộ nhớ). */
async function readHeadFromStorage(sb, path) {
  const { data, error } = await sb.storage.from(IMAGES_BUCKET).createSignedUrl(path, 60);
  if (error) throw error;
  const res = await fetch(data.signedUrl, { headers: { Range: `bytes=0-${HEAD_BYTES - 1}` } });
  if (!res.ok) throw new Error(`Không đọc được ảnh (${res.status})`);
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

/**
 * @param {object} [deps] thay thế khi test (Supabase giả).
 * @param {() => any} [deps.db] trả về client Supabase service_role.
 * @param {(sb: any, path: string) => Promise<Uint8Array>} [deps.readHead]
 */
export function createProfilesRouter({ db = supabaseAdmin, readHead = readHeadFromStorage } = {}) {
  const r = Router();

  // Sửa thông tin hồ sơ của chính mình. Chỉ các trường trong whitelist được ghi; role/is_locked không bao giờ.
  r.patch('/me', validate({ body: profileSchema }), async (req, res, next) => {
    try {
      const sb = db();
      const { data, error } = await sb.from('profiles').update(req.body).eq('id', req.user.id).select().single();
      if (error) throw error;
      res.json(await signAvatar(sb, data));
    } catch (e) {
      next(e);
    }
  });

  // Bước 1: cấp signed upload URL cho ảnh đại diện.
  r.post('/me/avatar-url', uploadLimiter, validate({ body: avatarUrlSchema }), async (req, res, next) => {
    try {
      const check = checkDeclaredAvatar({ mimeType: req.body.mime_type, size: req.body.file_size });
      if (!check.ok) throw badRequest(check.error);

      const path = buildAvatarPath(req.user.id, check.type);
      const { data, error } = await db().storage.from(IMAGES_BUCKET).createSignedUploadUrl(path);
      if (error) throw error;
      res.status(201).json({ path: data.path, token: data.token, signed_url: data.signedUrl, content_type: check.mime });
    } catch (e) {
      next(e);
    }
  });

  // Bước 3: xác nhận ảnh đã tải lên và gán làm ảnh đại diện.
  r.post('/me/avatar', validate({ body: avatarConfirmSchema }), async (req, res, next) => {
    try {
      const { path } = req.body;
      const parsed = parseAvatarPath(path);
      if (!parsed) throw badRequest('Đường dẫn ảnh không hợp lệ');
      if (parsed.userId !== req.user.id) throw forbidden('Ảnh không thuộc về bạn');

      const sb = db();
      const bucket = sb.storage.from(IMAGES_BUCKET);
      const discard = async (err) => {
        await bucket.remove([path]).catch(() => {});
        throw err;
      };

      const { data: info, error: infoErr } = await bucket.info(path);
      if (infoErr || !info) throw badRequest('Chưa thấy ảnh trên kho lưu trữ, hãy tải lên trước');

      const head = await readHead(sb, path);
      const fileError = checkStoredAvatar(parsed.type, { size: info.size, contentType: info.contentType, head });
      if (fileError) await discard(badRequest(fileError));

      const old = req.profile?.avatar_url;
      const { data, error } = await sb.from('profiles').update({ avatar_url: path }).eq('id', req.user.id)
        .select().single();
      if (error) await discard(error);

      // Dọn ảnh cũ sau khi đã ghi hồ sơ; lỗi dọn không làm hỏng yêu cầu.
      if (old && old !== path && parseAvatarPath(old)?.userId === req.user.id) {
        await bucket.remove([old]).catch(() => {});
      }
      res.json(await signAvatar(sb, data));
    } catch (e) {
      next(e);
    }
  });

  // FR-PRO-01/03 (xem hồ sơ người khác, bài đăng của họ): issue #17.
  r.use(stub('Hồ sơ', 'FR-PRO-01, FR-PRO-03', 'Khang'));

  return r;
}

export default createProfilesRouter();
