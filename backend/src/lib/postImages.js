// Ảnh bài đăng (FR-SOC-01, NFR-06). Thuần, không gọi mạng (trừ readImageHeadFromStorage/signPostImages):
// dùng chung cho route và test.
// Ảnh nằm trong bucket riêng tư `images` (≤ 1 MB, 0003_storage.sql), dùng tiền tố `posts/` để tách với `avatars/`.
// `posts.image_urls` trong CSDL lưu danh sách ĐƯỜNG DẪN trong bucket; khi trả về client đổi sang signed URL ngắn hạn.
import { randomUUID } from 'node:crypto';
import { DOCUMENT_TYPES, HEAD_BYTES, matchesMagic } from './files.js';
import { IMAGES_BUCKET } from './avatar.js';

export { IMAGES_BUCKET };
export const MAX_POST_IMAGE_SIZE = 1024 * 1024; // 1 MB (khớp file_size_limit của bucket images)
export const MAX_POST_IMAGES = 4; // khớp CHECK cardinality(image_urls) <= 4 (0001_schema.sql)
export const POST_IMAGE_TTL = 60 * 60; // giây

/** MIME → loại ảnh, dùng lại chữ ký đầu tệp của DOCUMENT_TYPES (png, jpg, webp). */
export const POST_IMAGE_TYPES = Object.fromEntries(
  ['png', 'jpg', 'webp'].map((t) => [DOCUMENT_TYPES[t].mime, t]),
);

const normMime = (m) => (m ?? '').split(';')[0].trim().toLowerCase();

const sizeError = (size) => {
  if (!Number.isInteger(size) || size <= 0) return 'Ảnh rỗng hoặc kích thước không hợp lệ';
  if (size > MAX_POST_IMAGE_SIZE) return 'Ảnh bài đăng vượt quá 1 MB';
  return null;
};

/**
 * Bước 1–2: kiểm tra thông tin ảnh do client khai báo trước khi cấp signed upload URL.
 * @returns {{ ok: true, type: string, mime: string } | { ok: false, error: string }}
 */
export function checkDeclaredPostImage({ mimeType, size }) {
  const mime = normMime(mimeType);
  const type = POST_IMAGE_TYPES[mime];
  if (!type) return { ok: false, error: 'Ảnh bài đăng chỉ nhận PNG, JPG hoặc WEBP' };
  const error = sizeError(size);
  if (error) return { ok: false, error };
  return { ok: true, type, mime };
}

/**
 * Kiểm tra metadata của ảnh thật trên Storage (kích thước, MIME đã lưu) trước khi đọc magic bytes.
 * @returns {string | null} thông báo lỗi, hoặc null nếu hợp lệ.
 */
export function checkStoredPostImageMeta(type, { size, contentType }) {
  const error = sizeError(size);
  if (error) return error;
  if (normMime(contentType) !== DOCUMENT_TYPES[type].mime) return 'Loại ảnh đã tải lên không hợp lệ';
  return null;
}

/**
 * Bước xác nhận: kiểm tra ảnh thật trên Storage (kích thước, MIME đã lưu, magic bytes).
 * @returns {string | null} thông báo lỗi, hoặc null nếu hợp lệ.
 */
export function checkStoredPostImage(type, { size, contentType, head }) {
  const metaError = checkStoredPostImageMeta(type, { size, contentType });
  if (metaError) return metaError;
  if (!matchesMagic(type, head)) return 'Nội dung ảnh không khớp với loại ảnh';
  return null;
}

// Đường dẫn: `posts/<user_id>/<uuid>.<loại>`. Thư mục là người dùng để bước xác nhận tự biết ảnh có
// phải do chính người này xin không, mà không cần lưu trạng thái giữa hai request.
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PATH_RE = new RegExp(`^posts/(${UUID})/${UUID}\\.(png|jpg|webp)$`);

export const buildPostImagePath = (userId, type) => `posts/${userId}/${randomUUID()}.${type}`;

/** @returns {{ userId: string, type: string } | null} */
export function parsePostImagePath(path) {
  const m = PATH_RE.exec(path ?? '');
  return m ? { userId: m[1], type: m[2] } : null;
}

/** Đọc vài byte đầu của ảnh trên Storage qua signed URL ngắn hạn (không tải cả ảnh vào bộ nhớ). */
export async function readImageHeadFromStorage(sb, path) {
  const { data, error } = await sb.storage.from(IMAGES_BUCKET).createSignedUrl(path, 60);
  if (error) throw error;
  const res = await fetch(data.signedUrl, { headers: { Range: `bytes=0-${HEAD_BYTES - 1}` } });
  if (!res.ok || !res.body) throw new Error(`Không đọc được ảnh (${res.status})`);
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
 * Ký signed URL cho toàn bộ ảnh bài đăng trong một lần gọi; mục lỗi/không tồn tại thì bỏ qua.
 * @param {any} sb client Supabase service_role
 * @param {Array<{ image_urls?: string[] }>} posts
 * @returns {Promise<Map<string, string>>}
 */
export async function signPostImages(sb, posts) {
  const paths = [...new Set(posts.flatMap((p) => p.image_urls ?? []).filter((u) => parsePostImagePath(u)))];
  if (!paths.length) return new Map();
  const { data, error } = await sb.storage.from(IMAGES_BUCKET).createSignedUrls(paths, POST_IMAGE_TTL);
  if (error) throw error;
  return new Map((data ?? []).filter((d) => d.signedUrl && !d.error).map((d) => [d.path, d.signedUrl]));
}
