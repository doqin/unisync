// Trang chủ – bảng tin (FR-SOC-01, FR-SOC-02) – phụ trách: Đức Huy (dhuyy-06).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, Container } from 'react-bootstrap';
import AsyncState from '../components/AsyncState.jsx';
import FeedSkeleton from '../components/FeedSkeleton.jsx';
import Icon from '../components/Icon.jsx';
import LoadMore from '../components/LoadMore.jsx';
import PostCard from '../components/PostCard.jsx';
import PostComposer from '../components/PostComposer.jsx';
import { api } from '../lib/api.js';
import '../styles/social.css';

const FEED_LIMIT = 10;
const TOAST_MS = 3000;

export default function Home() {
  const location = useLocation();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null); // { id, text, variant: 'edit' | 'delete' }

  const toastTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const errorSourceRef = useRef('initial');

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimeout(toastTimerRef.current);
    };
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

  const fetchFirstPage = useCallback(async ({ silent = false } = {}) => {
    const reqId = ++requestIdRef.current;
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await api(`/feed?limit=${FEED_LIMIT}`);
      if (!mountedRef.current || reqId !== requestIdRef.current) return;
      setItems(Array.isArray(res?.items) ? res.items : []);
      setNextCursor(res?.next_cursor ?? null);
      setHasMore(Boolean(res?.has_more));
    } catch (ex) {
      if (!mountedRef.current || reqId !== requestIdRef.current) return;
      errorSourceRef.current = silent ? 'refresh' : 'initial';
      setError(ex);
    } finally {
      if (mountedRef.current && reqId === requestIdRef.current) {
        if (silent) setRefreshing(false);
        else setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchFirstPage({ silent: false });
  }, [fetchFirstPage]);

  async function loadMore() {
    if (loading || refreshing || loadingMore || !hasMore || !nextCursor) return;
    const reqId = requestIdRef.current;
    setLoadingMore(true);
    setError(null);
    try {
      const res = await api(`/feed?limit=${FEED_LIMIT}&cursor=${encodeURIComponent(nextCursor)}`);
      if (!mountedRef.current || reqId !== requestIdRef.current) return;
      const extra = Array.isArray(res?.items) ? res.items : [];
      setItems((cur) => {
        const seen = new Set(cur.map((x) => x.id));
        return [...cur, ...extra.filter((x) => !seen.has(x.id))];
      });
      setNextCursor(res?.next_cursor ?? null);
      setHasMore(Boolean(res?.has_more));
    } catch (ex) {
      if (!mountedRef.current || reqId !== requestIdRef.current) return;
      errorSourceRef.current = 'more';
      setError(ex);
    } finally {
      if (mountedRef.current && reqId === requestIdRef.current) {
        setLoadingMore(false);
      }
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

  const handleRetry = () => {
    if (errorSourceRef.current === 'more') loadMore();
    else fetchFirstPage({ silent: items.length > 0 });
  };

  return (
    <Container className="py-4 soc-feed-col">
      <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
        <h1 className="h4 mb-0">Bảng tin</h1>
        <Button
          type="button"
          variant="outline-secondary"
          size="sm"
          className="soc-feed-refresh-btn"
          disabled={loading || refreshing || loadingMore}
          aria-busy={refreshing}
          onClick={() => fetchFirstPage({ silent: true })}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
            className={refreshing ? 'soc-spin' : undefined}
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <polyline points="21 3 21 9 15 9" />
          </svg>
          <span>{refreshing ? 'Đang làm mới…' : 'Làm mới'}</span>
        </Button>
      </div>

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
          {!error && (
            <LoadMore
              hasMore={hasMore}
              loading={loadingMore}
              onLoadMore={loadMore}
              endLabel={items.length > 0 ? 'Bạn đã xem hết bài đăng mới nhất.' : ''}
            />
          )}
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
