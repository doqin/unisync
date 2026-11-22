// Ảnh đại diện (FR-PRO-02, NFR-06). Thuần, không gọi mạng (trừ signAvatar): dùng chung cho route và test.
// Ảnh nằm trong bucket riêng tư `images` (≤ 1 MB, 0003_storage.sql), cùng bucket với ảnh bài đăng nên
// có tiền tố `avatars/`. `profiles.avatar_url` lưu ĐƯỜNG DẪN trong bucket; xem ảnh qua signed URL ngắn hạn.
import { randomUUID } from 'node:crypto';
import { DOCUMENT_TYPES, matchesMagic } from './files.js';

export const IMAGES_BUCKET = 'images';
export const MAX_AVATAR_SIZE = 1024 * 1024; // 1 MB (khớp file_size_limit của bucket)
export const AVATAR_VIEW_TTL = 60 * 60; // giây

/** MIME → loại ảnh, dùng lại chữ ký đầu tệp của DOCUMENT_TYPES (png, jpg, webp). */
export const AVATAR_TYPES = Object.fromEntries(
  ['png', 'jpg', 'webp'].map((t) => [DOCUMENT_TYPES[t].mime, t]),
);

const normMime = (m) => (m ?? '').split(';')[0].trim().toLowerCase();

const sizeError = (size) => {
  if (!Number.isInteger(size) || size <= 0) return 'Ảnh rỗng hoặc kích thước không hợp lệ';
  if (size > MAX_AVATAR_SIZE) return 'Ảnh đại diện vượt quá 1 MB';
  return null;
};

/**
 * Bước 2: kiểm tra thông tin ảnh do client khai báo.
 * @returns {{ ok: true, type: string, mime: string } | { ok: false, error: string }}
 */
export function checkDeclaredAvatar({ mimeType, size }) {
  const mime = normMime(mimeType);
  const type = AVATAR_TYPES[mime];
  if (!type) return { ok: false, error: 'Ảnh đại diện chỉ nhận PNG, JPG hoặc WEBP' };
  const error = sizeError(size);
  if (error) return { ok: false, error };
  return { ok: true, type, mime };
}

/**
 * Bước 4: kiểm tra ảnh thật trên Storage (kích thước, MIME đã lưu, magic bytes).
 * @returns {string | null} thông báo lỗi, hoặc null nếu hợp lệ.
 */
export function checkStoredAvatar(type, { size, contentType, head }) {
  const error = sizeError(size);
  if (error) return error;
  if (normMime(contentType) !== DOCUMENT_TYPES[type].mime) return 'Loại ảnh đã tải lên không hợp lệ';
  if (!matchesMagic(type, head)) return 'Nội dung ảnh không khớp với loại ảnh';
  return null;
}

// Đường dẫn: `avatars/<user_id>/<uuid>.<loại>`. Thư mục là người dùng để bước xác nhận tự biết ảnh có
// phải do chính người này xin không, mà không cần lưu trạng thái giữa hai request.
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PATH_RE = new RegExp(`^avatars/(${UUID})/${UUID}\\.(png|jpg|webp)$`);

export const buildAvatarPath = (userId, type) => `avatars/${userId}/${randomUUID()}.${type}`;

/** @returns {{ userId: string, type: string } | null} */
export function parseAvatarPath(path) {
  const m = PATH_RE.exec(path ?? '');
  return m ? { userId: m[1], type: m[2] } : null;
}

/**
 * Thay `avatar_url` (đường dẫn) bằng signed URL xem ảnh; không có ảnh hoặc không ký được → null.
 * @param {any} sb client Supabase service_role
 */
export async function signAvatar(sb, profile) {
  if (!profile) return profile;
  const path = profile.avatar_url;
  if (!path || !parseAvatarPath(path)) return { ...profile, avatar_url: null };
  const { data, error } = await sb.storage.from(IMAGES_BUCKET).createSignedUrl(path, AVATAR_VIEW_TTL);
  return { ...profile, avatar_url: error ? null : data.signedUrl };
}
