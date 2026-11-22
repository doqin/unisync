// Nén ảnh đại diện phía trình duyệt (FR-PRO-02): cắt vuông ở giữa, thu về tối đa 512 px, xuất WEBP/JPEG ≤ 1 MB.
// Phải khớp với backend/src/lib/avatar.js (loại ảnh, giới hạn 1 MB); backend vẫn kiểm tra lại.
export const MAX_AVATAR_SIZE = 1024 * 1024; // 1 MB
export const AVATAR_ACCEPT = 'image/png,image/jpeg,image/webp';
const INPUT_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_INPUT = 20 * 1024 * 1024; // ảnh gốc quá lớn thì không đọc vào bộ nhớ
const SIZES = [512, 384, 256];
const QUALITIES = [0.85, 0.7, 0.5];

/** @returns {string|null} thông báo lỗi, hoặc null nếu ảnh gốc hợp lệ. */
export function checkAvatarFile(file) {
  if (!file) return 'Chọn ảnh cần tải lên';
  if (!INPUT_TYPES.includes(file.type)) return 'Ảnh đại diện chỉ nhận PNG, JPG hoặc WEBP';
  if (file.size > MAX_INPUT) return 'Ảnh quá lớn (tối đa 20 MB)';
  return null;
}

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Nén ảnh thành Blob ≤ 1 MB.
 * @param {File} file
 * @returns {Promise<Blob>} Blob có `type` là image/webp hoặc image/jpeg
 */
export async function compressAvatar(file) {
  const error = checkAvatarFile(file);
  if (error) throw new Error(error);

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('Không đọc được ảnh này, hãy chọn ảnh khác');
  }
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;
    for (const size of SIZES) {
      const out = Math.min(size, side);
      const canvas = document.createElement('canvas');
      canvas.width = out;
      canvas.height = out;
      canvas.getContext('2d').drawImage(bitmap, sx, sy, side, side, 0, 0, out, out);
      for (const q of QUALITIES) {
        // Trình duyệt không hỗ trợ WEBP sẽ trả PNG/JPEG: ưu tiên WEBP, nếu không được thì JPEG.
        let blob = await toBlob(canvas, 'image/webp', q);
        if (blob?.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', q);
        if (blob && blob.size <= MAX_AVATAR_SIZE) return blob;
      }
    }
  } finally {
    bitmap.close?.();
  }
  throw new Error('Không nén được ảnh xuống 1 MB, hãy chọn ảnh khác');
}
