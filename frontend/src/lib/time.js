// Định dạng thời gian hiển thị tiếng Việt cho bài đăng và bình luận.

/** Thời gian tương đối ngắn gọn ("Vừa xong", "5 phút trước"...), quá 7 ngày hiện ngày/giờ. */
export function formatRelativeTime(iso) {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '';
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 60) return 'Vừa xong';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} giờ trước`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay} ngày trước`;
  return new Date(ts).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Thời gian đầy đủ đặt trong thuộc tính title của thẻ <time>. */
export function formatFullDateTime(iso) {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '';
  return new Date(ts).toLocaleString('vi-VN');
}
