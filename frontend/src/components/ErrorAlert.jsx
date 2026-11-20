import { Alert, Button } from 'react-bootstrap';
import { errorMessage } from '../lib/errors.js';

/**
 * Thông báo lỗi dùng chung (NFR-07) – phụ trách: Minh Trọng.
 * Không có lỗi thì không hiển thị gì, nên có thể đặt sẵn: <ErrorAlert error={err} />
 *
 * @param {object} props
 * @param {unknown} props.error chuỗi, Error hoặc ApiError
 * @param {string} [props.title] dòng tiêu đề in đậm, ví dụ "Không tải được tài liệu"
 * @param {() => void} [props.onRetry] có thì hiện nút "Thử lại"
 * @param {string} [props.retryLabel='Thử lại']
 * @param {() => void} [props.onClose] có thì cho phép đóng thông báo
 * @param {string} [props.className]
 */
export default function ErrorAlert({ error, title, onRetry, retryLabel = 'Thử lại', onClose, className = '' }) {
  const message = errorMessage(error);
  if (!message) return null;

  return (
    <Alert variant="danger" dismissible={Boolean(onClose)} onClose={onClose} closeLabel="Đóng" className={className}>
      <div className="d-flex flex-column flex-sm-row align-items-sm-center gap-2">
        <div className="flex-grow-1 text-break">
          {title && <div className="fw-semibold">{title}</div>}
          <div>{message}</div>
        </div>
        {onRetry && (
          <Button variant="outline-danger" size="sm" onClick={onRetry} className="flex-shrink-0 align-self-start align-self-sm-center">
            {retryLabel}
          </Button>
        )}
      </div>
    </Alert>
  );
}
