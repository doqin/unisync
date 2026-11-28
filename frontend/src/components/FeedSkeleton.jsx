// Khung chờ dạng skeleton khớp bố cục PostCard để danh sách bài đăng hiện ra không bị giật.
import { Card } from 'react-bootstrap';
import '../styles/social.css';

const SKELETON_POSTS = 3;

export default function FeedSkeleton({ label = 'Đang tải bảng tin…' }) {
  return (
    <div role="status">
      <span className="visually-hidden">{label}</span>
      <div aria-hidden="true">
        {Array.from({ length: SKELETON_POSTS }, (_, i) => (
          <Card key={i} body className="soc-post-card mb-3">
            <div className="d-flex align-items-center gap-2 gap-sm-3 mb-3">
              <span className="ui-skeleton ui-skeleton-circle flex-shrink-0" style={{ width: 42, height: 42 }} />
              <div className="flex-grow-1">
                <span className="ui-skeleton mb-2" style={{ height: 14, width: i === 1 ? '38%' : '46%' }} />
                <span className="ui-skeleton" style={{ height: 11, width: '24%' }} />
              </div>
            </div>
            <span className="ui-skeleton mb-2" style={{ height: 14, width: '92%' }} />
            <span className="ui-skeleton mb-2" style={{ height: 14, width: i === 0 ? '78%' : '86%' }} />
            {i !== 2 && <span className="ui-skeleton mb-3" style={{ height: 14, width: '54%' }} />}
            {i === 1 && <span className="ui-skeleton mb-3" style={{ height: 200, width: '100%' }} />}
            <div className="soc-post-actions d-flex gap-2">
              <span className="ui-skeleton" style={{ height: 31, width: 88 }} />
              <span className="ui-skeleton" style={{ height: 31, width: 116 }} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
