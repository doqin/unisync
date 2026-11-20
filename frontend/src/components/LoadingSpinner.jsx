import { Spinner } from 'react-bootstrap';

/**
 * Trạng thái đang tải dùng chung (NFR-07) – phụ trách: Minh Trọng.
 *
 * Mặc định: khối căn giữa có chữ "Đang tải…".
 * `inline`: spinner nhỏ đặt trong nút hoặc dòng chữ, ví dụ
 *   <Button disabled={busy}>{busy ? <LoadingSpinner inline label="Đang lưu…" /> : 'Lưu'}</Button>
 *
 * @param {object} props
 * @param {string} [props.label='Đang tải…'] chữ hiển thị và đọc cho trình đọc màn hình
 * @param {boolean} [props.inline=false] dạng nhỏ nằm cùng dòng
 * @param {boolean} [props.hideLabel=false] ẩn chữ trên màn hình (vẫn đọc cho trình đọc màn hình)
 * @param {string} [props.className]
 */
export default function LoadingSpinner({ label = 'Đang tải…', inline = false, hideLabel = false, className = '' }) {
  const text = <span className={hideLabel ? 'visually-hidden' : undefined}>{label}</span>;

  if (inline) {
    return (
      <span role="status" className={`d-inline-flex align-items-center gap-2 ${className}`.trim()}>
        <Spinner as="span" animation="border" size="sm" aria-hidden="true" />
        {text}
      </span>
    );
  }

  return (
    <div role="status" className={`state-block text-center ${className}`.trim()}>
      <Spinner animation="border" variant="primary" aria-hidden="true" />
      <div className={hideLabel ? undefined : 'mt-2 text-body-secondary'}>{text}</div>
    </div>
  );
}
