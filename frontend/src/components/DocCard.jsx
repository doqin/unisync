// Thẻ tài liệu dùng chung cho module thư viện: trang Thư viện (lưới/danh sách) và "Tài liệu cùng môn" ở trang chi tiết.
// Một nơi duy nhất quyết định giao diện thẻ, nên chỉnh một lần là mọi chỗ đồng bộ.
import { Link } from 'react-router-dom';
import { Card } from 'react-bootstrap';
import { formatSize } from '../lib/files.js';
import FileBadge from './FileBadge.jsx';

// compact: dạng danh sách cho cột hẹp, thông tin phụ nằm dưới tên môn thay vì cùng hàng bên phải.
export default function DocCard({ doc: d, subject = '', view = 'grid', index = 0, compact = false }) {
  const list = view === 'list';
  const date = new Date(d.created_at).toLocaleDateString('vi-VN');

  // Điểm sao (chỉ khi đã có đánh giá), lượt tải, dung lượng.
  const stats = (
    <>
      {d.rating_count > 0 && (
        <span className="lib-card-rating" aria-label={`${d.rating_avg} trên 5 sao, ${d.rating_count} lượt đánh giá`}
          title={`${d.rating_count} lượt đánh giá`}>
          ★ {d.rating_avg.toLocaleString('vi-VN', { minimumFractionDigits: 1 })}
        </span>
      )}
      <span>{d.download_count ?? 0} lượt tải</span>
      <span>{formatSize(d.file_size)}</span>
    </>
  );

  const heading = (
    <>
      <div className="fw-bold text-break lib-doc-title">{d.title}</div>
      <div className="lib-card-sub text-muted text-break mt-1">{subject}</div>
    </>
  );

  let body;
  if (list) {
    body = (
      <Card.Body className="d-flex align-items-center gap-3 py-2 px-3">
        <FileBadge type={d.file_type} size={compact ? 'sm' : 'md'} />
        <div className="lib-min-w-0 flex-grow-1">
          {heading}
          {/* Cột hẹp hoặc điện thoại: thông tin phụ xuống dưới tên môn. */}
          <div className={`lib-card-stats lib-card-stats-dots small text-muted mt-1 ${compact ? '' : 'd-md-none'}`}>
            {stats}
            {!compact && <span>{date}</span>}
          </div>
        </div>
        {!compact && (
          <div className="lib-card-stats small text-muted flex-shrink-0 d-none d-md-flex column-gap-4">
            {stats}
            <span>{date}</span>
          </div>
        )}
      </Card.Body>
    );
  } else {
    body = (
      <Card.Body className="d-flex flex-column lib-card-body">
        <div className="mb-2"><FileBadge type={d.file_type} /></div>
        {heading}
        <div className="mt-auto pt-3 lib-card-sub">
          <div className="d-flex justify-content-between flex-wrap gap-2 border-top pt-2 text-muted">
            <div className="lib-card-stats lib-card-stats-dots">{stats}</div>
            <span>{date}</span>
          </div>
        </div>
      </Card.Body>
    );
  }

  return (
    <Link to={`/library/${d.id}`} className="lib-doc-card-link text-decoration-none text-reset d-block h-100">
      <Card className="lib-doc-card h-100 lib-fade-up" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
        {body}
      </Card>
    </Link>
  );
}
