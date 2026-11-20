/**
 * Trạng thái danh sách trống dùng chung (NFR-07) – phụ trách: Minh Trọng.
 *
 * <EmptyState title="Chưa có bài đăng" message="Theo dõi bạn bè để xem bài của họ."
 *   action={<Button as={Link} to="/search">Tìm bạn</Button>} />
 *
 * @param {object} props
 * @param {string} [props.title='Chưa có dữ liệu']
 * @param {import('react').ReactNode} [props.message] mô tả hoặc gợi ý bước tiếp theo
 * @param {import('react').ReactNode} [props.icon] thay biểu tượng mặc định; `null` để ẩn
 * @param {import('react').ReactNode} [props.action] nút hoặc liên kết
 * @param {string} [props.className]
 */
export default function EmptyState({ title = 'Chưa có dữ liệu', message, icon, action, className = '' }) {
  const shownIcon = icon === undefined ? <InboxIcon /> : icon;
  return (
    <div className={`empty-state state-block text-center ${className}`.trim()}>
      {shownIcon && <div className="empty-state-icon" aria-hidden="true">{shownIcon}</div>}
      <p className="fw-semibold mb-1">{title}</p>
      {message && <p className="text-body-secondary mb-0">{message}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

function InboxIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" focusable="false">
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}
