// Chi tiết bài đăng, thích và bình luận /posts/:id (FR-SOC-03, FR-SOC-04) – phụ trách: Đức Huy (dhuyy-06).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Container } from 'react-bootstrap';
import BackButton from '../components/BackButton.jsx';
import CommentSection from '../components/CommentSection.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorAlert from '../components/ErrorAlert.jsx';
import Icon from '../components/Icon.jsx';
import PostCard from '../components/PostCard.jsx';
import { api } from '../lib/api.js';
import '../styles/social.css';

const TOAST_MS = 3000;

function PostDetailSkeleton() {
  return (
    <div role="status">
      <span className="visually-hidden">Đang tải bài đăng…</span>
      <div aria-hidden="true">
        <Card body className="soc-post-card mb-3">
          <div className="d-flex align-items-center gap-2 gap-sm-3 mb-3">
            <span className="ui-skeleton ui-skeleton-circle flex-shrink-0" style={{ width: 42, height: 42 }} />
            <div className="flex-grow-1">
              <span className="ui-skeleton mb-2" style={{ height: 14, width: '40%' }} />
              <span className="ui-skeleton" style={{ height: 11, width: '24%' }} />
            </div>
          </div>
          <span className="ui-skeleton mb-2" style={{ height: 14, width: '95%' }} />
          <span className="ui-skeleton mb-2" style={{ height: 14, width: '88%' }} />
          <span className="ui-skeleton mb-3" style={{ height: 14, width: '60%' }} />
          <div className="soc-post-actions d-flex gap-2">
            <span className="ui-skeleton" style={{ height: 31, width: 92 }} />
            <span className="ui-skeleton" style={{ height: 31, width: 116 }} />
          </div>
        </Card>
        <Card body className="soc-post-card">
          <span className="ui-skeleton mb-3" style={{ height: 20, width: '32%' }} />
          <span className="ui-skeleton mb-3" style={{ height: 64, width: '100%' }} />
          <span className="ui-skeleton mb-2" style={{ height: 14, width: '72%' }} />
          <span className="ui-skeleton" style={{ height: 14, width: '50%' }} />
        </Card>
      </div>
    </div>
  );
}

export default function PostDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [toast, setToast] = useState(null); // { id, text, variant: 'edit' | 'delete' }

  const commentInputRef = useRef(null);
  const toastTimerRef = useRef(null);

  useEffect(() => () => {
    clearTimeout(toastTimerRef.current);
  }, []);

  const showToast = useCallback((text, variant = 'edit') => {
    clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), text, variant });
    toastTimerRef.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const closeToast = () => {
    clearTimeout(toastTimerRef.current);
    setToast(null);
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setPost(null);

    api(`/posts/${id}`)
      .then((data) => { if (alive) setPost(data); })
      .catch((ex) => { if (alive) setError(ex); })
      .finally(() => { if (alive) setLoading(false); });

    return () => { alive = false; };
  }, [id, reloadKey]);

  const handleUpdated = (updated, source) => {
    setPost(updated);
    if (source === 'edit') showToast('Đã sửa bài đăng thành công', 'edit');
  };

  const handleDeleted = () => {
    navigate('/home', {
      replace: true,
      state: { toast: { text: 'Đã xóa bài đăng thành công', variant: 'delete' } },
    });
  };

  const handleCommentCountChange = (delta) => {
    setPost((cur) => (cur ? { ...cur, comment_count: Math.max(0, (cur.comment_count ?? 0) + delta) } : cur));
  };

  const focusCommentInput = () => {
    const el = commentInputRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus({ preventScroll: true });
  };

  let body;
  if (loading) {
    body = <PostDetailSkeleton />;
  } else if (error && [400, 404].includes(error.status)) {
    body = (
      <EmptyState
        title="Không tìm thấy bài đăng"
        message="Bài viết có thể đã bị xóa hoặc đường dẫn không đúng."
        action={<Button as={Link} to="/home">Về bảng tin</Button>}
      />
    );
  } else if (error?.status === 403) {
    body = (
      <EmptyState
        title="Không có quyền xem bài đăng"
        message="Bài viết này thuộc một nhóm kín. Chỉ thành viên đã được duyệt mới có thể xem và bình luận."
        action={<Button as={Link} to="/groups" variant="outline-primary">Xem danh sách nhóm</Button>}
      />
    );
  } else if (error) {
    body = (
      <ErrorAlert
        error={error}
        title="Không tải được bài đăng"
        onRetry={() => setReloadKey((k) => k + 1)}
      />
    );
  } else if (post) {
    body = (
      <>
        <PostCard
          post={post}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
          onCommentClick={focusCommentInput}
        />
        <CommentSection
          postId={post.id}
          commentCount={post.comment_count ?? 0}
          onCountChange={handleCommentCountChange}
          onToast={showToast}
          inputRef={commentInputRef}
        />
      </>
    );
  }

  return (
    <Container className="py-4 soc-feed-col">
      <div className="mb-2">
        <BackButton fallback="/home">Quay lại bảng tin</BackButton>
      </div>
      <h1 className="visually-hidden">Chi tiết bài đăng</h1>

      {body}

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
