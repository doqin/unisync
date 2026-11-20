// Chuyển lỗi bất kỳ thành câu tiếng Việt để hiển thị (NFR-07) – phụ trách: Minh Trọng.
const NETWORK = /failed to fetch|networkerror|load failed|network request failed/i;

export const DEFAULT_ERROR = 'Có lỗi xảy ra. Vui lòng thử lại.';
export const NETWORK_ERROR = 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.';

/**
 * Lấy thông báo lỗi để hiển thị.
 * - chuỗi → giữ nguyên;
 * - ApiError / Error (backend và các module đã trả tiếng Việt) → `message`;
 * - lỗi mạng của fetch (tiếng Anh, khác nhau theo trình duyệt) → câu tiếng Việt.
 * @param {unknown} error
 * @returns {string} chuỗi rỗng nếu không có lỗi
 */
export function errorMessage(error, fallback = DEFAULT_ERROR) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  const msg = typeof error.message === 'string' ? error.message.trim() : '';
  if (error.name === 'TypeError' && NETWORK.test(msg)) return NETWORK_ERROR;
  return msg || fallback;
}
