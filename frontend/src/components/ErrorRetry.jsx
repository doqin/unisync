// Khối báo lỗi kèm nút "Thử lại", dùng chung cho thư viện và trang chi tiết.
import { Alert, Button } from 'react-bootstrap';

export default function ErrorRetry({ message, onRetry, className = '' }) {
  return (
    <Alert variant="danger" className={`d-flex justify-content-between align-items-center flex-wrap gap-2 ${className}`}>
      <span>{message}</span>
      <Button variant="outline-danger" size="sm" className="rounded-pill px-3" onClick={onRetry}>
        Thử lại
      </Button>
    </Alert>
  );
}
