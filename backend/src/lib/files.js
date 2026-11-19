// Kiểm tra tệp tài liệu (FR-DOC-02, NFR-06). Thuần, không gọi mạng: dùng chung cho route và test.
// Danh sách loại tệp phải khớp với CHECK documents.file_type (0001_schema.sql)
// và allowed_mime_types của bucket `documents` (0003_storage.sql).
import { randomUUID } from 'node:crypto';

export const DOCUMENTS_BUCKET = 'documents';
export const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10 MB

const ZIP = [0x50, 0x4b, 0x03, 0x04]; // DOCX/PPTX là tệp ZIP (Office Open XML)

/** file_type → MIME chuẩn, các phần mở rộng chấp nhận, chữ ký đầu tệp (magic bytes). */
export const DOCUMENT_TYPES = {
  pdf:  { mime: 'application/pdf', exts: ['pdf'], magic: [{ at: 0, bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }] }, // %PDF-
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', exts: ['docx'], magic: [{ at: 0, bytes: ZIP }] },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', exts: ['pptx'], magic: [{ at: 0, bytes: ZIP }] },
  png:  { mime: 'image/png', exts: ['png'], magic: [{ at: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }] },
  jpg:  { mime: 'image/jpeg', exts: ['jpg', 'jpeg'], magic: [{ at: 0, bytes: [0xff, 0xd8, 0xff] }] },
  webp: { mime: 'image/webp', exts: ['webp'], magic: [{ at: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, { at: 8, bytes: [0x57, 0x45, 0x42, 0x50] }] }, // RIFF....WEBP
};

/** Số byte đầu tệp cần đọc để nhận dạng mọi loại ở trên. */
export const HEAD_BYTES = 16;

// Trình duyệt có thể không biết MIME (vd. máy không cài Office): chấp nhận và dựa vào phần mở rộng,
// vì bucket chặn MIME khác và bước xác nhận còn kiểm tra magic bytes.
const GENERIC_MIMES = new Set(['', 'application/octet-stream']);

const normMime = (m) => (m ?? '').split(';')[0].trim().toLowerCase();

/** Phần mở rộng → file_type, hoặc null nếu không hỗ trợ. */
export function fileTypeFromName(fileName) {
  const ext = /\.([a-z0-9]+)$/i.exec(fileName ?? '')?.[1]?.toLowerCase();
  if (!ext) return null;
  return Object.keys(DOCUMENT_TYPES).find((t) => DOCUMENT_TYPES[t].exts.includes(ext)) ?? null;
}

/**
 * Bước 2: kiểm tra thông tin tệp do client khai báo.
 * @returns {{ ok: true, fileType: string, mime: string } | { ok: false, error: string }}
 */
export function checkDeclaredFile({ fileName, mimeType, size }) {
  const fileType = fileTypeFromName(fileName);
  if (!fileType) return { ok: false, error: 'Chỉ nhận tệp PDF, DOCX, PPTX, PNG, JPG, WEBP' };
  const { mime } = DOCUMENT_TYPES[fileType];
  const m = normMime(mimeType);
  if (!GENERIC_MIMES.has(m) && m !== mime) return { ok: false, error: 'Loại tệp không khớp với phần mở rộng' };
  const sizeError = checkSize(size);
  if (sizeError) return { ok: false, error: sizeError };
  return { ok: true, fileType, mime };
}

function checkSize(size) {
  if (!Number.isInteger(size) || size <= 0) return 'Tệp rỗng hoặc kích thước không hợp lệ';
  if (size > MAX_DOCUMENT_SIZE) return 'Tệp vượt quá 10 MB';
  return null;
}

/** Chữ ký đầu tệp có khớp file_type không. */
export function matchesMagic(fileType, head) {
  const spec = DOCUMENT_TYPES[fileType];
  if (!spec || !head) return false;
  return spec.magic.every(({ at, bytes }) => bytes.every((b, i) => head[at + i] === b));
}

/**
 * Bước 4: kiểm tra tệp thật trên Storage (kích thước, MIME đã lưu, magic bytes).
 * @returns {string | null} thông báo lỗi, hoặc null nếu hợp lệ.
 */
export function checkStoredFile(fileType, { size, contentType, head }) {
  const sizeError = checkSize(size);
  if (sizeError) return sizeError;
  if (normMime(contentType) !== DOCUMENT_TYPES[fileType].mime) return 'Loại tệp đã tải lên không hợp lệ';
  if (!matchesMagic(fileType, head)) return 'Nội dung tệp không khớp với loại tệp';
  return null;
}

// Đường dẫn lưu trữ: `<user_id>/<uuid>.<file_type>`. Tên tệp là UUID (NFR-06); thư mục là người tải lên
// để bước xác nhận biết đường dẫn do chính người này xin, mà không cần lưu trạng thái giữa hai request.
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PATH_RE = new RegExp(`^(${UUID})/(${UUID})\\.(${Object.keys(DOCUMENT_TYPES).join('|')})$`);

export const buildStoragePath = (userId, fileType) => `${userId}/${randomUUID()}.${fileType}`;

/** @returns {{ userId: string, fileType: string } | null} */
export function parseStoragePath(path) {
  const m = PATH_RE.exec(path ?? '');
  return m ? { userId: m[1], fileType: m[3] } : null;
}
