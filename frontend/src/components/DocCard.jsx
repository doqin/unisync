// Thẻ tài liệu dùng chung cho module thư viện: trang Thư viện (lưới/danh sách) và "Tài liệu cùng môn" ở trang chi tiết.
// Một nơi duy nhất quyết định giao diện thẻ, nên chỉnh một lần là mọi chỗ đồng bộ.
import { Link } from 'react-router-dom';
import { Card } from 'react-bootstrap';
import { formatSize } from '../lib/files.js';

export default function DocCard({ doc: d, subject = '', view = 'grid', index = 0 }) {
  const list = view === 'list';
  const date = new Date(d.created_at).toLocaleDateString('vi-VN');
  return (
    <Link to={`/library/${d.id}`} className="lib-doc-card-link text-decoration-none text-reset d-block h-100">
      <Card className="lib-doc-card h-100 lib-fade-up" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
        <Card.Body className={list ? 'py-2' : undefined}>
          <div className={`d-flex gap-3 ${list ? 'align-items-center' : 'align-items-start'}`}>
            <span className={`lib-file-badge lib-file-${d.file_type}`} aria-hidden="true"
              style={list ? { width: 40, height: 40, borderRadius: 10, fontSize: '0.65rem' } : undefined}>
              {d.file_type.toUpperCase()}
            </span>
            <div className="lib-min-w-0 flex-grow-1">
              <div className="fw-semibold text-break lib-doc-title">{d.title}</div>
              <div className="small text-muted text-break">
                {subject}
                {list && <span className="d-sm-none"> · {formatSize(d.file_size)} · {date}</span>}
              </div>
            </div>
            {list && (
              <div className="small text-muted text-end flex-shrink-0 d-none d-sm-block">
                <div>{formatSize(d.file_size)}</div>
                <div>{date}</div>
              </div>
            )}
          </div>
          {!list && (
            <div className="small text-muted mt-3 d-flex justify-content-between">
              <span>{formatSize(d.file_size)}</span>
              <span>{date}</span>
            </div>
          )}
        </Card.Body>
      </Card>
    </Link>
  );
}
