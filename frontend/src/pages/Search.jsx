// Tìm kiếm / gợi ý người dùng theo tên (FR-SOC-06) – phụ trách: Minh Trọng (minhtrong2921).
// Từ khóa nằm trên URL (?q=) để chia sẻ và quay lại được. Dữ liệu qua Express: GET /api/users.
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, Button, Container, Form, InputGroup, ListGroup } from 'react-bootstrap';
import { api } from '../lib/api.js';
import { errorMessage } from '../lib/errors.js';
import usePagedList from '../hooks/usePagedList.js';
import AsyncState from '../components/AsyncState.jsx';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import LoadMore from '../components/LoadMore.jsx';

const PAGE_SIZE = 20; // khớp limit mặc định của GET /api/users
const SKELETON_ROWS = 5;
const TOAST_MS = 2500;
// Chỉ tự đặt con trỏ vào ô tìm trên máy có chuột; trên điện thoại bàn phím bật lên sẽ che phần gợi ý.
const AUTO_FOCUS = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

function subtitle(u) {
  return [u.major, u.school, u.year ? `Năm ${u.year}` : null].filter(Boolean).join(' · ');
}

/** Lý do gợi ý (chỉ có ở chế độ gợi ý), lấy lý do mạnh nhất. */
function reasonText(u) {
  const r = u.reason;
  if (!r) return '';
  if (r.follows_me) return 'Đang theo dõi bạn';
  if (r.mutual_count > 0) return `${r.mutual_count} người bạn theo dõi cũng theo dõi`;
  if (r.same_major) return 'Cùng ngành với bạn';
  if (r.same_school) return 'Cùng trường với bạn';
  return '';
}

/** Khung chờ cùng bố cục với UserRow để danh sách thật hiện ra không bị nhảy. */
function SearchSkeleton() {
  return (
    <div role="status">
      <span className="visually-hidden">Đang tìm…</span>
      <ListGroup aria-hidden="true">
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <ListGroup.Item key={i} className="d-flex align-items-center gap-3 py-3">
            <span className="ui-skeleton ui-skeleton-circle flex-shrink-0" style={{ width: 48, height: 48 }} />
            <div className="flex-grow-1">
              <span className="ui-skeleton mb-2" style={{ height: 14, width: `${55 - (i % 3) * 10}%` }} />
              <span className="ui-skeleton" style={{ height: 12, width: '35%' }} />
            </div>
            <span className="ui-skeleton flex-shrink-0" style={{ width: 84, height: 31 }} />
          </ListGroup.Item>
        ))}
      </ListGroup>
    </div>
  );
}

function UserRow({ user, index, onChange, onToast }) {
  const [busy, setBusy] = useState(false);
  const [hot, setHot] = useState(false); // đang rê chuột / focus vào nút
  const [justFollowed, setJustFollowed] = useState(false); // vừa bấm theo dõi: chưa đổi sang "Bỏ theo dõi" cho tới khi rời nút

  async function toggleFollow() {
    const unfollow = user.is_following;
    setBusy(true);
    try {
      const s = await api(`/follows/${user.id}`, { method: unfollow ? 'DELETE' : 'POST' });
      onChange({ ...user, is_following: s.is_following, is_followed_by: s.is_followed_by, is_mutual: s.is_mutual });
      setJustFollowed(!unfollow);
      onToast({ text: `${unfollow ? 'Đã bỏ theo dõi' : 'Đã theo dõi'} ${user.full_name}` });
    } catch (e) {
      onToast({ text: errorMessage(e), error: true });
    } finally {
      setBusy(false);
    }
  }

  const enter = () => setHot(true);
  const leave = () => { setHot(false); setJustFollowed(false); };
  // Đang theo dõi + rê chuột → nút báo trước hành động "Bỏ theo dõi" (đỏ), tránh bấm nhầm.
  const warnUnfollow = user.is_following && hot && !justFollowed;
  const label = warnUnfollow ? 'Bỏ theo dõi'
    : user.is_following ? 'Đang theo dõi' : user.is_followed_by ? 'Theo dõi lại' : 'Theo dõi';
  const variant = warnUnfollow ? 'outline-danger' : user.is_following ? 'outline-secondary' : 'primary';
  // Hiện lần lượt trong mỗi trang; mục của trang cũ đã gắn sẵn nên không chạy lại hiệu ứng khi "Tải thêm".
  const delay = Math.min(index % PAGE_SIZE, 10) * 40;
  return (
    <ListGroup.Item className="ui-fade-up d-flex align-items-center gap-3 py-3" style={{ animationDelay: `${delay}ms` }}>
      <Link to={`/u/${user.id}`} className="text-reset text-decoration-none d-flex align-items-center gap-3 flex-grow-1" style={{ minWidth: 0 }}>
        <Avatar src={user.avatar_url} name={user.full_name} size={48} />
        <div style={{ minWidth: 0 }}>
          <div className="fw-semibold text-truncate">
            {user.full_name}
            {user.is_mutual && <Badge bg="success-subtle" text="success-emphasis" className="ms-2 align-middle">Mutual</Badge>}
          </div>
          {subtitle(user) && <div className="small text-body-secondary text-truncate">{subtitle(user)}</div>}
          {reasonText(user) && <div className="small text-primary text-truncate">{reasonText(user)}</div>}
        </div>
      </Link>
      <Button size="sm" className="flex-shrink-0" style={{ minWidth: 112 }} variant={variant}
        onClick={toggleFollow} disabled={busy} aria-busy={busy}
        onMouseEnter={enter} onMouseLeave={leave} onFocus={enter} onBlur={leave}
        aria-label={`${user.is_following ? 'Bỏ theo dõi' : 'Theo dõi'} ${user.full_name}`}>
        {label}
      </Button>
    </ListGroup.Item>
  );
}

export default function Search() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [draft, setDraft] = useState(q);
  const [toast, setToast] = useState(null); // { id, text, error? }
  const toastTimer = useRef(null);
  const inputRef = useRef(null);

  // Đổi URL khi người dùng ngừng gõ ~300ms.
  useEffect(() => {
    const t = setTimeout(() => {
      const v = draft.trim();
      if (v === q) return;
      setParams(v ? { q: v } : {}, { replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [draft, q, setParams]);

  // Đồng bộ ô nhập khi URL đổi (nút quay lại của trình duyệt).
  useEffect(() => { setDraft((d) => (d.trim() === q ? d : q)); }, [q]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  function showToast(t) {
    clearTimeout(toastTimer.current);
    setToast({ ...t, id: Date.now() }); // id mới → key mới → hiệu ứng trượt lên chạy lại
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }

  const list = usePagedList(
    (page) => api(`/users?${new URLSearchParams({ page: String(page), ...(q ? { q } : {}) })}`),
    [q],
  );

  const updateUser = (u) => list.setItems((items) => items.map((x) => (x.id === u.id ? u : x)));

  // Kết quả lần tải gần nhất: đổi từ khóa thì vẫn hiện (mờ đi) cho tới khi có kết quả mới, không nháy khung chờ.
  const [shown, setShown] = useState({ items: [], hasMore: false });
  useEffect(() => {
    if (!list.loading) setShown({ items: list.items, hasMore: list.hasMore });
  }, [list.loading, list.items, list.hasMore]);
  const stale = list.loading;
  const items = stale ? shown.items : list.items;

  function clearSearch() {
    setDraft('');
    setParams({}, { replace: true });
    inputRef.current?.focus();
  }

  return (
    <Container className="py-4" style={{ maxWidth: 720 }}>
      <h1 className="h3 mb-3">Tìm kiếm người dùng</h1>
      <Form role="search" onSubmit={(e) => { e.preventDefault(); setParams(draft.trim() ? { q: draft.trim() } : {}); }}>
        <InputGroup className="search-group mb-4">
          <InputGroup.Text as="span" className="search-group-icon" aria-hidden="true"><Icon name="search" size={18} /></InputGroup.Text>
          <Form.Control ref={inputRef} type="search" value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape' && draft) { e.preventDefault(); clearSearch(); } }}
            maxLength={100} placeholder="Nhập tên người dùng…" aria-label="Tên người dùng cần tìm"
            autoFocus={AUTO_FOCUS} />
          {draft && (
            <button type="button" className="search-group-clear" onClick={clearSearch} aria-label="Xoá từ khóa">
              <Icon name="close" size={16} />
            </button>
          )}
        </InputGroup>
      </Form>

      <h2 className="h6 text-body-secondary mb-2">{q ? `Kết quả cho “${q}”` : 'Gợi ý cho bạn'}</h2>
      {stale && items.length === 0 ? <SearchSkeleton /> : (
        <AsyncState loading={false} error={stale ? null : list.error} empty={items.length === 0} onRetry={list.retry}
          emptyTitle={q ? 'Không tìm thấy người dùng' : 'Chưa có gợi ý'}
          emptyMessage={q ? 'Thử tên khác hoặc gõ không dấu.' : 'Bạn đã theo dõi tất cả mọi người.'}>
          <div className={stale ? 'ui-stale' : undefined} aria-busy={stale}>
            {stale && <span className="visually-hidden" role="status">Đang tìm…</span>}
            <ListGroup>
              {items.map((u, i) => (
                <UserRow key={u.id} user={u} index={i} onChange={updateUser} onToast={showToast} />
              ))}
            </ListGroup>
            {!stale && <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onLoadMore={list.loadMore} />}
          </div>
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
