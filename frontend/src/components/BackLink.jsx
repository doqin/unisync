// Liên kết quay lại có mũi tên, dùng chung cho các trang con của module thư viện (chi tiết, tải lên).
import { Link, useLocation, useNavigate } from 'react-router-dom';

/**
 * Bấm thì về đúng trang vừa đứng (giữ tab "Của tôi", bộ lọc, từ khóa).
 * Mở thẳng bằng link (chưa có lịch sử trong ứng dụng) thì để liên kết đi tới `to` như bình thường.
 */
export function useGoBack() {
  const { key } = useLocation();
  const nav = useNavigate();
  return (e) => {
    if (key === 'default' || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    nav(-1);
  };
}

export default function BackLink({ to = '/library', children }) {
  const goBack = useGoBack();
  const hasHistory = useLocation().key !== 'default';
  return (
    <Link to={to} onClick={goBack} className="lib-back-link mb-3">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M19 12H5M11 6l-6 6 6 6" />
      </svg>
      {children ?? (hasHistory ? 'Quay lại' : 'Thư viện tài liệu')}
    </Link>
  );
}
