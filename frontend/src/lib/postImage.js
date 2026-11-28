// Nén và tải ảnh bài đăng phía trình duyệt (FR-SOC-01, NFR-06).
// Khớp backend/src/lib/postImages.js và bucket `images` (PNG/JPG/WEBP, ≤ 1 MB, tối đa 4 ảnh/bài).
import { api } from './api.js';
import { supabase } from './supabase.js';

export const POST_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp';
export const MAX_POST_IMAGE_SIZE = 1024 * 1024; // 1 MB
export const MAX_POST_IMAGES = 4;

const INPUT_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_INPUT = 20 * 1024 * 1024; // tránh đọc ảnh gốc quá nặng vào bộ nhớ trình duyệt
const MAX_SIDES = [1600, 1280, 960, 720];
const QUALITIES = [0.85, 0.72, 0.55];

/** @returns {string | null} thông báo lỗi tiếng Việt, hoặc null nếu ảnh hợp lệ. */
export function checkPostImageFile(file) {
  if (!file) return 'Chọn ảnh cần tải lên';
  if (!INPUT_TYPES.includes(file.type)) return 'Ảnh bài đăng chỉ nhận PNG, JPG hoặc WEBP';
  if (file.size <= 0) return 'Ảnh rỗng hoặc không hợp lệ';
  if (file.size > MAX_INPUT) return 'Ảnh quá lớn (tối đa 20 MB trước khi nén)';
  return null;
}

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Nén ảnh giữ nguyên tỷ lệ khung hình xuống ≤ 1 MB.
 * @param {File} file
 * @returns {Promise<Blob>}
 */
export async function compressPostImage(file) {
  const error = checkPostImageFile(file);
  if (error) throw new Error(error);

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('Không đọc được ảnh này, hãy chọn ảnh khác');
  }

  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    for (const maxSide of MAX_SIDES) {
      const scale = longest > maxSide ? maxSide / longest : 1;
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);

      for (const q of QUALITIES) {
        // Ưu tiên WEBP để dung lượng nhẹ; trình duyệt không hỗ trợ sẽ fallback sang JPEG.
        let blob = await toBlob(canvas, 'image/webp', q);
        if (blob?.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', q);
        if (blob && blob.size <= MAX_POST_IMAGE_SIZE) return blob;
      }
    }
  } finally {
    bitmap.close?.();
  }
  throw new Error('Không nén được ảnh xuống 1 MB, hãy chọn ảnh khác');
}

/**
 * Tải 1 ảnh bài đăng lên bucket `images`: nén → xin signed upload URL → upload thẳng Storage.
 * @param {File} file
 * @param {(stage: 'compress' | 'url' | 'upload') => void} [onStage]
 * @returns {Promise<string>} đường dẫn trong bucket để gửi vào `POST /api/posts`
 */
export async function uploadPostImage(file, onStage) {
  onStage?.('compress');
  const blob = await compressPostImage(file);

  onStage?.('url');
  const up = await api('/posts/upload-url', {
    method: 'POST',
    body: { mime_type: blob.type, file_size: blob.size },
  });

  onStage?.('upload');
  const { error } = await supabase.storage
    .from('images')
    .uploadToSignedUrl(up.path, up.token, new Blob([blob], { type: up.content_type }));
  if (error) throw new Error('Tải ảnh lên thất bại, hãy thử lại');

  return up.path;
}
