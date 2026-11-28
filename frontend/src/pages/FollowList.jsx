// Danh sách người theo dõi / đang theo dõi (FR-SOC-10) – phụ trách: Đức Huy (dhuyy-06).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button, Container, ListGroup } from 'react-bootstrap';
import AsyncState from '../components/AsyncState.jsx';
import Avatar from '../components/Avatar.jsx';
import EmptyState from '../components/EmptyState.jsx';
import FollowButton, { MutualBadge } from '../components/FollowButton.jsx';
import Icon from '../components/Icon.jsx';
import LoadMore from '../components/LoadMore.jsx';
import usePagedList from '../hooks/usePagedList.js';
import { api } from '../lib/api.js';
import '../styles/social.css';

const PAGE_SIZE = 20;
const SKELETON_ROWS = 5;
const TOAST_MS = 2500;
const COMPACT_QUERY = '(max-width: 575.98px)';

const num = (n) => Number(n ?? 0).toLocaleString('vi-VN');
const subtitle = (u) => [u.major, u.school, u.year ? `Năm ${u.year}` : null].filter(Boolean).join(' · ');

function useCompactViewport() {
  const [compact, setCompact] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia?.(COMPACT_QUERY).matches
  ));
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia(COMPACT_QUERY);
    const onChange = () => setCompact(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return compact;
}

/** Khung chờ cùng bố cục với FollowUserRow để danh sách thật hiện ra không bị nhảy. */
function FollowListSkeleton({ avatarSize = 48 }) {
  return (
    <div role="status">
      <span className="visually-hidden">Đang tải danh sách…</span>
      <ListGroup aria-hidden="true">
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <ListGroup.Item key={i} className="d-flex align-items-center gap-2 gap-sm-3 py-3">
            <span
              className="ui-skeleton ui-skeleton-circle flex-shrink-0"
              style={{ width: avatarSize, height: avatarSize }}
            />
            <div className="flex-grow-1">
              <span className="ui-skeleton mb-2" style={{ height: 14, width: `${55 - (i % 3) * 10}%` }} />
              <span className="ui-skeleton" style={{ height: 12, width: '35%' }} />
            </div>
            <span className="ui-skeleton flex-shrink-0" style={{ width: 88, height: 31 }} />
          </ListGroup.Item>
        ))}
      </ListGroup>
    </div>
  );
}

function FollowUserRow({ user, index, avatarSize, onChanged, onToast }) {
  const info = subtitle(user);
  const delay = Math.min(index % PAGE_SIZE, 10) * 40;
  return (
    <ListGroup.Item className="ui-fade-up d-flex align-items-center gap-2 gap-sm-3 py-3" style={{ animationDelay: `${delay}ms` }}>
      <Link
        to={`/u/${user.id}`}
        className="text-reset text-decoration-none d-flex align-items-center gap-2 gap-sm-3 flex-grow-1"
        style={{ minWidth: 0 }}
      >
        <Avatar src={user.avatar_url} name={user.full_name} size={avatarSize} />
        <div style={{ minWidth: 0 }}>
          <div className="d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
            <span className="fw-semibold text-truncate">{user.full_name}</span>
            {user.is_mutual && <MutualBadge className="flex-shrink-0" />}
          </div>
          {info && <div className="small text-body-secondary text-truncate">{info}</div>}
        </div>
      </Link>
      {!user.is_self && (
        <FollowButton
          size="sm"
          className="flex-shrink-0 soc-follow-row-btn"
          userId={user.id}
          fullName={user.full_name}
          isFollowing={user.is_following}
          isFollowedBy={user.is_followed_by}
          onChanged={(s) => onChanged(user, s)}
          onToast={onToast}
        />
      )}
    </ListGroup.Item>
  );
}

export default function FollowList({ tab = 'followers' }) {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const stateOwner = location.state?.ownerProfile;
  const isCompact = useCompactViewport();
  const avatarSize = isCompact ? 42 : 48;

  const [owner, setOwner] = useState(() => (stateOwner?.id === id ? stateOwner : null));
  const [ownerError, setOwnerError] = useState(null);
  const [ownerReloadKey, setOwnerReloadKey] = useState(0);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const showToast = useCallback((t) => {
    clearTimeout(toastTimer.current);
    setToast({ ...t, id: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(() => {
    let alive = true;
    setOwner((cur) => {
      if (cur?.id === id) return cur;
      return stateOwner?.id === id ? stateOwner : null;
    });
    setOwnerError(null);
    api(`/profiles/${id}`)
      .then((p) => alive && setOwner(p))
      .catch((e) => alive && setOwnerError(e));
    return () => { alive = false; };
  }, [id, ownerReloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = usePagedList((page) => api(`/follows/${id}/${tab}?page=${page}`), [id, tab]);

  const notFoundErr = [ownerError, list.error].find((e) => e && [400, 404].includes(e.status));
  if (notFoundErr) {
    return (
      <Container className="py-5" style={{ maxWidth: 560 }}>
        <h1 className="visually-hidden">Không tìm thấy người dùng</h1>
        <EmptyState
          title="Không tìm thấy người dùng"
          message="Hồ sơ không tồn tại hoặc đường dẫn không đúng."
          action={<Button as={Link} to="/home">Về trang chủ</Button>}
        />
      </Container>
    );
  }

  const goBackToProfile = () => {
    const idx = window.history.state?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(`/u/${id}`, { replace: true });
  };

  const handleItemFollowChange = (u, s) => {
    const wasFollowing = Boolean(u.is_following);
    const nowFollowing = Boolean(s.is_following);
    list.setItems((items) => items.map((x) => (x.id === u.id ? {
      ...x,
      is_following: nowFollowing,
      is_followed_by: Boolean(s.is_followed_by),
      is_mutual: Boolean(s.is_mutual),
    } : x)));
    setOwner((cur) => {
      if (!cur) return cur;
      const next = { ...cur };
      if (cur.is_self && wasFollowing !== nowFollowing) {
        next.following_count = Math.max(0, (cur.following_count ?? 0) + (nowFollowing ? 1 : -1));
      }
      if (u.id === id && s.followers_count !== undefined) {
        next.followers_count = s.followers_count;
      }
      return next;
    });
  };

  const retryAll = () => {
    if (ownerError || !owner) setOwnerReloadKey((k) => k + 1);
    if (list.error) list.retry();
  };

  const showSkeleton = list.loading && list.items.length === 0 && !list.error;
  const isFollowers = tab === 'followers';
  const emptyTitle = isFollowers ? 'Chưa có người theo dõi' : 'Chưa theo dõi ai';
  const emptyMessage = isFollowers
    ? (owner?.is_self ? 'Khi có sinh viên theo dõi bạn, họ sẽ xuất hiện tại đây.' : 'Chưa có ai theo dõi người dùng này.')
    : (owner?.is_self ? 'Khám phá và kết nối với bạn bè qua trang tìm kiếm người dùng.' : 'Người dùng này chưa theo dõi ai.');
  const emptyAction = !isFollowers && owner?.is_self
    ? <Button as={Link} to="/search" variant="outline-primary">Tìm người dùng</Button>
    : null;

  return (
    <Container className="py-4" style={{ maxWidth: 720 }}>
      <div className="d-flex align-items-center gap-2 gap-sm-3 mb-2">
        <button
          type="button"
          onClick={goBackToProfile}
          className="soc-back-icon-btn"
          aria-label="Về hồ sơ"
          title="Về hồ sơ"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
        </button>

        {owner ? (
          <Link
            to={`/u/${id}`}
            className="text-reset text-decoration-none d-inline-flex align-items-center gap-3 flex-grow-1"
            style={{ minWidth: 0 }}
          >
            <Avatar src={owner.avatar_url} name={owner.full_name} size={44} decorative />
            <div style={{ minWidth: 0 }}>
              <h1 className="h4 mb-0 text-truncate">{owner.full_name}</h1>
              <p className="small text-body-secondary mb-0">
                {isFollowers ? 'Người theo dõi' : 'Đang theo dõi'}
              </p>
            </div>
          </Link>
        ) : (
          <div className="d-flex align-items-center gap-3 flex-grow-1" style={{ minWidth: 0 }} aria-hidden="true">
            <span className="ui-skeleton ui-skeleton-circle flex-shrink-0" style={{ width: 44, height: 44 }} />
            <div className="flex-grow-1">
              <span className="ui-skeleton mb-2" style={{ height: 18, width: 160 }} />
              <span className="ui-skeleton" style={{ height: 12, width: 96 }} />
            </div>
          </div>
        )}
      </div>

      <nav className="ui-tabs soc-follow-tabs my-3" aria-label="Quan hệ theo dõi">
        <Link
          to={`/u/${id}/followers`}
          replace
          state={owner ? { ownerProfile: owner } : undefined}
          aria-current={isFollowers ? 'page' : undefined}
          className={`ui-tab${isFollowers ? ' active' : ''}`}
        >
          Người theo dõi{owner ? ` (${num(owner.followers_count)})` : ''}
        </Link>
        <Link
          to={`/u/${id}/following`}
          replace
          state={owner ? { ownerProfile: owner } : undefined}
          aria-current={!isFollowers ? 'page' : undefined}
          className={`ui-tab${!isFollowers ? ' active' : ''}`}
        >
          Đang theo dõi{owner ? ` (${num(owner.following_count)})` : ''}
        </Link>
      </nav>

      {showSkeleton ? (
        <FollowListSkeleton avatarSize={avatarSize} />
      ) : (
        <AsyncState
          loading={false}
          error={list.error || (!owner ? ownerError : null)}
          empty={!list.loading && list.items.length === 0}
          onRetry={retryAll}
          errorTitle="Không tải được danh sách"
          emptyTitle={emptyTitle}
          emptyMessage={emptyMessage}
          emptyAction={emptyAction}
        >
          <ListGroup>
            {list.items.map((u, i) => (
              <FollowUserRow
                key={u.id}
                user={u}
                index={i}
                avatarSize={avatarSize}
                onChanged={handleItemFollowChange}
                onToast={showToast}
              />
            ))}
          </ListGroup>
          <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onLoadMore={list.loadMore} />
        </AsyncState>
      )}

      <div className="ui-toast-layer" role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className={`ui-toast${toast.error ? ' ui-toast-error' : ''}`}>
            <Icon name={toast.error ? 'alert' : 'check'} size={18} />
            {toast.text}
          </div>
        )}
      </div>
    </Container>
  );
}
