// Quy tắc tệp tài liệu phía client (FR-DOC-02) – chỉ để báo lỗi sớm cho người dùng.
// Phải khớp với backend/src/lib/files.js; backend vẫn kiểm tra lại (kể cả magic bytes).
export const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10 MB
export const ACCEPT = '.pdf,.docx,.pptx,.png,.jpg,.jpeg,.webp';
const EXTS = ['pdf', 'docx', 'pptx', 'png', 'jpg', 'jpeg', 'webp'];

/** @returns {string|null} thông báo lỗi, hoặc null nếu hợp lệ. */
export function checkFile(file) {
  if (!file) return 'Chọn tệp cần tải lên';
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase();
  if (!EXTS.includes(ext)) return 'Chỉ nhận tệp PDF, DOCX, PPTX, PNG, JPG, WEBP';
  if (file.size <= 0) return 'Tệp rỗng';
  if (file.size > MAX_DOCUMENT_SIZE) return 'Tệp vượt quá 10 MB';
  return null;
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
