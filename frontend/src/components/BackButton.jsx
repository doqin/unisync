// Quay lại trang trước; mở thẳng link (không có lịch sử) thì về `fallback`.
import { useNavigate } from 'react-router-dom';

export default function BackButton({ fallback = '/', children = 'Quay lại', className = '' }) {
  const navigate = useNavigate();

  const goBack = () => {
    // React Router lưu vị trí trong lịch sử ở history.state.idx; 0 nghĩa là trang đầu tiên của phiên
    const idx = window.history.state?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  };

  return (
    <button type="button" onClick={goBack} className={`back-button ${className}`.trim()}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M19 12H5M11 6l-6 6 6 6" />
      </svg>
      {children}
    </button>
  );
}
