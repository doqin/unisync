import EmptyState from './EmptyState.jsx';
import ErrorAlert from './ErrorAlert.jsx';
import LoadingSpinner from './LoadingSpinner.jsx';

/**
 * Chọn đúng trạng thái đang tải / lỗi / trống / có dữ liệu (NFR-07) – phụ trách: Minh Trọng.
 * Thay cho chuỗi if/else lặp lại ở mỗi trang.
 *
 *   <AsyncState loading={loading} error={err} empty={items.length === 0} onRetry={reload}
 *     emptyTitle="Chưa có tài liệu" emptyMessage="Hãy là người đầu tiên tải lên.">
 *     <ListGroup>...</ListGroup>
 *   </AsyncState>
 *
 * Thứ tự: đang tải → lỗi (khi chưa có dữ liệu) → trống → nội dung.
 * Nếu đã có dữ liệu mà lỗi (ví dụ lỗi khi "Tải thêm") thì vẫn giữ nội dung và hiện lỗi bên dưới.
 * Trang chi tiết (không phải danh sách) bỏ `empty`: khi lỗi chỉ hiện thông báo lỗi.
 *
 * @param {object} props
 * @param {boolean} props.loading
 * @param {unknown} [props.error]
 * @param {boolean} [props.empty] danh sách rỗng
 * @param {() => void} [props.onRetry]
 * @param {string} [props.loadingLabel]
 * @param {string} [props.errorTitle]
 * @param {string} [props.emptyTitle]
 * @param {import('react').ReactNode} [props.emptyMessage]
 * @param {import('react').ReactNode} [props.emptyAction]
 * @param {import('react').ReactNode} props.children
 */
export default function AsyncState({
  loading, error, empty, onRetry,
  loadingLabel, errorTitle, emptyTitle, emptyMessage, emptyAction,
  children,
}) {
  if (loading) return <LoadingSpinner label={loadingLabel} />;
  const hasContent = empty === false;
  if (error && !hasContent) return <ErrorAlert error={error} title={errorTitle} onRetry={onRetry} />;
  if (empty) return <EmptyState title={emptyTitle} message={emptyMessage} action={emptyAction} />;
  return (
    <>
      {children}
      {error && <ErrorAlert error={error} title={errorTitle} onRetry={onRetry} className="mt-3" />}
    </>
  );
}
