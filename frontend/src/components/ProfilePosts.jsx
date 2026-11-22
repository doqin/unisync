// Danh sách bài đăng trên trang hồ sơ (FR-PRO-03): mới nhất trước, "Tải thêm".
import { Link } from 'react-router-dom';
import { Badge, Card } from 'react-bootstrap';
import AsyncState from './AsyncState.jsx';
import LoadMore from './LoadMore.jsx';
import usePagedList from '../hooks/usePagedList.js';
import { api } from '../lib/api.js';

const when = (iso) => new Date(iso).toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' });

function PostItem({ post }) {
  return (
    <Card as="article" body className="mb-3">
      <div className="d-flex flex-wrap align-items-center gap-2 text-body-secondary small mb-2">
        <Link to={`/posts/${post.id}`} className="text-body-secondary">
          <time dateTime={post.created_at}>{when(post.created_at)}</time>
        </Link>
        {post.group && <Badge bg="secondary" pill>Nhóm {post.group.name ?? ''}</Badge>}
      </div>
      <p className="mb-2 text-break" style={{ whiteSpace: 'pre-wrap' }}>{post.content}</p>
      {post.image_urls.length > 0 && (
        <div className="row g-2 mb-2">
          {post.image_urls.map((src, i) => (
            <div key={src} className={post.image_urls.length === 1 ? 'col-12' : 'col-6'}>
              <img src={src} alt={`Ảnh ${i + 1} của bài đăng`} loading="lazy" className="img-fluid rounded w-100 object-fit-cover"
                style={{ maxHeight: 320 }} />
            </div>
          ))}
        </div>
      )}
      <div className="small text-body-secondary">
        {post.like_count} lượt thích · {post.comment_count} bình luận
      </div>
    </Card>
  );
}

/** @param {{ userId: string, isSelf: boolean }} props */
export default function ProfilePosts({ userId, isSelf }) {
  const list = usePagedList((page) => api(`/profiles/${userId}/posts?page=${page}`), [userId]);
  return (
    <section aria-labelledby="profile-posts-title">
      <h2 id="profile-posts-title" className="h5 mb-3">Bài đăng</h2>
      <AsyncState
        loading={list.loading} error={list.error} empty={list.items.length === 0} onRetry={list.retry}
        errorTitle="Không tải được bài đăng"
        emptyTitle="Chưa có bài đăng"
        emptyMessage={isSelf ? 'Bài bạn đăng sẽ hiện ở đây.' : 'Người này chưa có bài đăng nào bạn xem được.'}
      >
        {list.items.map((p) => <PostItem key={p.id} post={p} />)}
        <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onLoadMore={list.loadMore} />
      </AsyncState>
    </section>
  );
}
