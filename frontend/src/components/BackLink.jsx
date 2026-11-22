// Liên kết quay lại có mũi tên, dùng chung cho các trang con của module thư viện (chi tiết, tải lên).
import { Link } from 'react-router-dom';

export default function BackLink({ to = '/library', children = 'Thư viện tài liệu' }) {
  return (
    <Link to={to} className="lib-back-link mb-3">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M19 12H5M11 6l-6 6 6 6" />
      </svg>
      {children}
    </Link>
  );
}
