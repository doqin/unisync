import { Button } from 'react-bootstrap';
import LoadingSpinner from './LoadingSpinner.jsx';

/**
 * Nút "Tải thêm" cho danh sách phân trang (NFR-07) – phụ trách: Minh Trọng.
 * Dùng cùng hook usePagedList: <LoadMore hasMore={hasMore} loading={loadingMore} onLoadMore={loadMore} />
 *
 * @param {object} props
 * @param {boolean} props.hasMore còn trang sau (`has_more` từ API)
 * @param {boolean} [props.loading=false] đang tải trang sau
 * @param {() => void} props.onLoadMore
 * @param {string} [props.label='Tải thêm']
 * @param {string} [props.endLabel] chữ hiện khi đã hết (bỏ trống thì không hiện gì)
 * @param {string} [props.className]
 */
export default function LoadMore({ hasMore, loading = false, onLoadMore, label = 'Tải thêm', endLabel, className = '' }) {
  if (!hasMore) {
    return endLabel ? <p className={`text-center text-body-secondary small mt-3 mb-0 ${className}`.trim()}>{endLabel}</p> : null;
  }
  return (
    <div className={`text-center mt-3 ${className}`.trim()}>
      <Button variant="outline-primary" onClick={onLoadMore} disabled={loading} aria-busy={loading}>
        {loading ? <LoadingSpinner inline /> : label}
      </Button>
    </div>
  );
}
