// Trang chủ – bảng tin (FR-SOC-01, FR-SOC-02) – phụ trách: Đức Huy (dhuyy-06).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, Card, Container } from 'react-bootstrap';
import AsyncState from '../components/AsyncState.jsx';
import Icon from '../components/Icon.jsx';
import LoadMore from '../components/LoadMore.jsx';
import PostCard from '../components/PostCard.jsx';
import PostComposer from '../components/PostComposer.jsx';
import { api } from '../lib/api.js';
import '../styles/social.css';

const FEED_LIMIT = 10;
const SKELETON_POSTS = 3;
const TOAST_MS = 3000;

/** Khung chờ dạng skeleton khớp bố cục PostCard để danh sách thật hiện ra không bị giật. */
function FeedSkeleton() {
  return (
    <div role="status">
      <span className="visually-hidden">Đang tải bảng tin…</span>
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

export default function Home() {
  const location = useLocation();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null); // { id, text, variant: 'edit' | 'delete' }
  const toastTimerRef = useRef(null);

  useEffect(() => () => {
    clearTimeout(toastTimerRef.current);
  }, []);

  const showToast = useCallback((text, variant = 'edit') => {
    clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), text, variant });
    toastTimerRef.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(() => {
    const incoming = location.state?.toast;
    if (!incoming?.text) return;
    showToast(incoming.text, incoming.variant ?? 'edit');
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate, showToast]);

  const closeToast = () => {
    clearTimeout(toastTimerRef.current);
    setToast(null);
  };

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api(`/feed?limit=${FEED_LIMIT}`);
      setItems(Array.isArray(res?.items) ? res.items : []);
      setNextCursor(res?.next_cursor ?? null);
      setHasMore(Boolean(res?.has_more));
    } catch (ex) {
      setError(ex);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  async function loadMore() {
    if (loading || loadingMore || !hasMore || !nextCursor) return;
    setLoadingMore(true);
    setError(null);
    try {
      const res = await api(`/feed?limit=${FEED_LIMIT}&cursor=${encodeURIComponent(nextCursor)}`);
      const extra = Array.isArray(res?.items) ? res.items : [];
      setItems((cur) => {
        const seen = new Set(cur.map((x) => x.id));
        return [...cur, ...extra.filter((x) => !seen.has(x.id))];
      });
      setNextCursor(res?.next_cursor ?? null);
      setHasMore(Boolean(res?.has_more));
    } catch (ex) {
      setError(ex);
    } finally {
      setLoadingMore(false);
    }
  }

  const handleCreated = (created) => {
    setItems((cur) => [created, ...cur.filter((x) => x.id !== created.id)]);
  };

  const handleUpdated = (updated, source) => {
    setItems((cur) => cur.map((x) => (x.id === updated.id ? updated : x)));
    if (source === 'edit') showToast('Đã sửa bài đăng thành công', 'edit');
  };

  const handleDeleted = (postId) => {
    setItems((cur) => cur.filter((x) => x.id !== postId));
    showToast('Đã xóa bài đăng thành công', 'delete');
  };

  const handleRetry = () => (items.length > 0 ? loadMore() : loadInitial());

  return (
    <Container className="py-4 soc-feed-col">
      <h1 className="h4 mb-3">Bảng tin</h1>

      <PostComposer onCreated={handleCreated} />

      {loading ? (
        <FeedSkeleton />
      ) : (
        <AsyncState
          loading={false}
          error={error}
          empty={items.length === 0}
          onRetry={handleRetry}
          errorTitle="Không tải được bảng tin"
          emptyTitle="Bảng tin chưa có bài viết nào"
          emptyMessage="Hãy đăng bài đầu tiên của bạn hoặc theo dõi thêm bạn bè cùng trường."
          emptyAction={<Button as={Link} to="/search" variant="outline-primary">Tìm bạn bè</Button>}
        >
          {items.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          ))}
          <LoadMore hasMore={hasMore} loading={loadingMore} onLoadMore={loadMore} />
        </AsyncState>
      )}

      <div className="soc-toast-layer" role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className={`soc-toast soc-toast--${toast.variant}`}>
            <Icon name="check" size={18} className="soc-toast-icon" />
            <span>{toast.text}</span>
            <button type="button" className="soc-toast-close" onClick={closeToast} aria-label="Đóng thông báo">
              <Icon name="close" size={14} />
            </button>
          </div>
        )}
      </div>
    </Container>
  );
}
