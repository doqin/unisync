// Thư viện tài liệu (FR-DOC-03, FR-DOC-04) – phụ trách: Đức Trọng (ImDT06).
// Duyệt theo môn, lọc theo loại tệp, tìm kiếm từ khóa không dấu, sắp xếp. Dữ liệu qua Express (api()).
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, Col, Container, Form, InputGroup, Row } from 'react-bootstrap';
import { api } from '../lib/api.js';
import { getRecent, removeRecent } from '../lib/recent.js';
import FilterDropdown from '../components/FilterDropdown.jsx';
import DocCard from '../components/DocCard.jsx';
import '../styles/library.css';

const FILE_TYPES = ['pdf', 'docx', 'pptx', 'png', 'jpg', 'webp'];
const CAN_OBSERVE = typeof IntersectionObserver !== 'undefined';

function readView() {
  try { return localStorage.getItem('lib-view') === 'list' ? 'list' : 'grid'; } catch { return 'grid'; }
}

export default function Library() {
  const [params, setParams] = useSearchParams();
  const group = params.get('group') ?? '';
  const type = params.get('type') ?? '';
  const q = params.get('q') ?? '';
  const sort = params.get('sort') ?? 'newest';
  const mine = params.get('mine') === '1'; // tab "Của tôi"

  const [subjects, setSubjects] = useState([]);
  const [draftQ, setDraftQ] = useState(q);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState('');
  const [reloadKey, setReloadKey] = useState(0); // tăng lên để tải lại (nút "Thử lại")
  const [view, setView] = useState(readView);
  const [recent, setRecent] = useState(getRecent);
  const searchRef = useRef(null);
  const sentinelRef = useRef(null);
  const reqRef = useRef(0); // số thứ tự yêu cầu, để bỏ qua phản hồi của bộ lọc cũ

  // Tìm ngay khi người dùng ngừng gõ khoảng 300ms; Enter vẫn gửi ngay.
  useEffect(() => {
    const t = setTimeout(() => {
      const v = draftQ.trim();
      setParams((prev) => {
        if ((prev.get('q') ?? '') === v) return prev; // không đổi thì giữ nguyên
        const next = new URLSearchParams(prev);
        if (v) next.set('q', v); else next.delete('q');
        return next;
      });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftQ]);

  useEffect(() => {
    api('/documents/subjects').then(setSubjects).catch(() => setSubjects([]));
  }, []);

  // Phím tắt "/" nhảy vào ô tìm kiếm (không kích hoạt khi đang gõ trong một ô nhập).
  useEffect(() => {
    function onKey(e) {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
      if (!searchRef.current) return;
      e.preventDefault();
      searchRef.current.focus();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const buildPath = (p) => {
    if (mine) return `/documents/mine?page=${p}`;
    const qs = new URLSearchParams({ page: String(p) });
    if (group) qs.set('group_id', group);
    if (type) qs.set('file_type', type);
    if (q) qs.set('q', q);
    if (sort === 'rating') qs.set('sort', 'rating');
    return `/documents?${qs}`;
  };

  // Đổi bộ lọc hoặc tab → tải lại từ trang 1.
  useEffect(() => {
    let alive = true;
    const myReq = ++reqRef.current;
    setLoading(true); setErr(''); setPage(1);
    api(buildPath(1))
      .then((r) => { if (alive && reqRef.current === myReq) { setItems(r.items); setHasMore(r.has_more); } })
      .catch((e) => alive && setErr(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, type, q, sort, mine, reloadKey]);

  function update(patch) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
      return next;
    });
  }

  async function loadMore() {
    if (loadingMore) return;
    const nextPage = page + 1;
    const myReq = reqRef.current;
    setLoadingMore(true);
    try {
      const r = await api(buildPath(nextPage));
      if (reqRef.current !== myReq) return; // bộ lọc đã đổi trong lúc chờ: bỏ kết quả cũ
      setItems((cur) => [...cur, ...r.items]);
      setHasMore(r.has_more);
      setPage(nextPage);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoadingMore(false);
    }
  }

  // Cuộn tới cuối danh sách thì tự tải trang kế tiếp.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!CAN_OBSERVE || !el || !hasMore || loading || loadingMore || err) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadMore();
    }, { rootMargin: '240px' });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loading, loadingMore, err, page, items.length]);

  const subjectName = (id) => {
    const s = subjects.find((x) => x.id === id);
    return s ? (s.code ? `${s.code} – ${s.name}` : s.name) : '';
  };

  function changeView(v) {
    setView(v);
    try { localStorage.setItem('lib-view', v); } catch { /* bỏ qua */ }
  }

  function switchTab(toMine) {
    setDraftQ('');
    setParams(toMine ? new URLSearchParams({ mine: '1' }) : new URLSearchParams());
  }

  // Có bộ lọc hoặc từ khóa đang bật (sắp xếp mặc định "newest" không tính là lọc).
  const hasFilter = Boolean(q || group || type || sort === 'rating');
  function clearFilters() {
    setDraftQ('');
    setParams(new URLSearchParams());
  }

  const gridCols = view === 'list' ? { xs: 1 } : { xs: 1, sm: 2, lg: 3 };

  let results;
  if (loading && items.length === 0) {
    results = (
      <Row {...gridCols} className={view === 'list' ? 'g-2' : 'g-3'} aria-busy="true" aria-label="Đang tải tài liệu">
        {Array.from({ length: 6 }).map((_, i) => (
          <Col key={i}>
            <Card body className="h-100 border-0 shadow-sm" style={{ borderRadius: 14 }}>
              <div className="d-flex gap-3">
                <div className="lib-skeleton" style={{ width: 48, height: 48 }} />
                <div className="flex-grow-1">
                  <div className="lib-skeleton mb-2" style={{ height: 16, width: '80%' }} />
                  <div className="lib-skeleton" style={{ height: 12, width: '50%' }} />
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    );
  } else if (err && items.length === 0) {
    results = (
      <Alert variant="danger" className="d-flex justify-content-between align-items-center flex-wrap gap-2">
        <span>Không tải được tài liệu: {err}</span>
        <Button variant="outline-danger" size="sm" className="rounded-pill px-3" onClick={() => setReloadKey((k) => k + 1)}>
          Thử lại
        </Button>
      </Alert>
    );
  } else if (items.length === 0) {
    results = (
      <Card body className="text-center py-5 border-0 shadow-sm" style={{ borderRadius: 14 }}>
        {mine ? (
          <>
            <div className="fw-semibold">Bạn chưa tải lên tài liệu nào</div>
            <div className="small text-muted">Tài liệu bạn đóng góp sẽ hiện ở đây.</div>
            <div className="mt-3">
              <Button as={Link} to="/library/new" size="sm" className="rounded-pill px-3">Tải lên tài liệu đầu tiên</Button>
            </div>
          </>
        ) : (
          <>
            <div className="fw-semibold">Không có tài liệu nào{q || group || type ? ' khớp bộ lọc' : ' trong thư viện'}</div>
            <div className="small text-muted">Thử đổi bộ lọc, hoặc là người đầu tiên tải tài liệu lên.</div>
            {hasFilter && (
              <div className="mt-3">
                <Button variant="outline-primary" size="sm" className="rounded-pill px-3" onClick={clearFilters}>Xóa bộ lọc</Button>
              </div>
            )}
          </>
        )}
      </Card>
    );
  } else {
    results = (
      <div key={view} className={loading ? 'lib-results-loading' : undefined}>
        <Row {...gridCols} className={view === 'list' ? 'g-2' : 'g-3'}>
          {items.map((d, i) => (
            <Col key={d.id}>
              <DocCard doc={d} subject={subjectName(d.group_id)} view={view} index={i} />
            </Col>
          ))}
        </Row>
        {err && (
          <Alert variant="danger" className="mt-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
            <span>Không tải thêm được: {err}</span>
            <Button variant="outline-danger" size="sm" className="rounded-pill px-3" onClick={() => { setErr(''); loadMore(); }}>
              Thử lại
            </Button>
          </Alert>
        )}
        {hasMore && !err && (
          <div ref={sentinelRef} className="text-center mt-4" style={{ minHeight: 40 }}>
            {loadingMore && <span className="small text-muted">Đang tải…</span>}
            {!CAN_OBSERVE && !loadingMore && (
              <Button variant="outline-primary" className="rounded-pill px-4" onClick={loadMore}>Tải thêm</Button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <Container className="py-4 library-page">
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3 ps-3">
        <div>
          <h1 className="h4 mb-0">Thư viện tài liệu</h1>
        </div>
        <Button as={Link} to={group ? `/library/new?group=${group}` : '/library/new'} className="rounded-pill px-3 d-inline-flex align-items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Tải lên
        </Button>
      </div>

      <div className="lib-tabs mb-3 px-3" role="tablist" aria-label="Phạm vi tài liệu">
        <button type="button" role="tab" aria-selected={!mine} className={`lib-tab ${!mine ? 'active' : ''}`} onClick={() => switchTab(false)}>
          Tất cả
        </button>
        <button type="button" role="tab" aria-selected={mine} className={`lib-tab ${mine ? 'active' : ''}`} onClick={() => switchTab(true)}>
          Của tôi
        </button>
      </div>

      {!mine && !hasFilter && recent.length > 0 && (
        <section className="mb-2 px-3" aria-label="Xem gần đây">
          <div className="small text-muted mb-2">Xem gần đây</div>
          <div className="lib-recent">
            {recent.map((d) => (
              <div key={d.id} className="lib-recent-chip">
                <Link to={`/library/${d.id}`} className="lib-recent-link">
                  <span className={`lib-file-badge lib-file-${d.file_type}`} style={{ width: 28, height: 28, fontSize: '0.55rem', borderRadius: 7 }} aria-hidden="true">
                    {(d.file_type || '').toUpperCase()}
                  </span>
                  <span className="text-truncate">{d.title}</span>
                </Link>
                <button type="button" className="lib-recent-x" aria-label={`Xóa ${d.title} khỏi xem gần đây`} title="Xóa khỏi xem gần đây"
                  onClick={() => { removeRecent(d.id); setRecent(getRecent()); }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {!mine && (
        <Card body className="mb-2 border-0 shadow-sm" style={{ borderRadius: 14 }}>
          <Form onSubmit={(e) => { e.preventDefault(); update({ q: draftQ.trim() }); }}>
            <div className="lib-filter-bar">
              <div className="lib-filter-search">
                <InputGroup className="lib-search-group">
                  <InputGroup.Text as="span" className="lib-search-icon" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="7" />
                      <path d="m20 20-3.5-3.5" />
                    </svg>
                  </InputGroup.Text>
                  <Form.Control ref={searchRef} placeholder="Tìm tài liệu, môn học…" value={draftQ}
                    onChange={(e) => setDraftQ(e.target.value)} aria-label="Tìm kiếm tài liệu (phím tắt /)" maxLength={200} />
                </InputGroup>
              </div>
              <div className="lib-filter-subject">
                <FilterDropdown id="flt-subject" label="Lọc theo môn" value={group}
                  onChange={(v) => update({ group: v })}
                  options={[{ value: '', label: 'Tất cả môn' },
                    ...(group && !subjects.some((s) => s.id === group) ? [{ value: group, label: 'Đang tải…' }] : []),
                    ...subjects.map((s) => ({ value: s.id, label: s.code ? `${s.code} – ${s.name}` : s.name }))]} />
              </div>
              <div className="lib-filter-type">
                <FilterDropdown id="flt-type" label="Lọc theo loại tệp" value={type}
                  onChange={(v) => update({ type: v })}
                  options={[{ value: '', label: 'Tất cả' },
                    ...FILE_TYPES.map((t) => ({ value: t, label: t.toUpperCase() }))]} />
              </div>
              <div className="lib-filter-sort">
                <FilterDropdown id="flt-sort" label="Sắp xếp" value={sort}
                  onChange={(v) => update({ sort: v === 'rating' ? 'rating' : '' })}
                  options={[{ value: 'newest', label: 'Mới nhất' }, { value: 'rating', label: 'Điểm cao nhất' }]} />
              </div>
            </div>
          </Form>
        </Card>
      )}

      {/* Dòng trạng thái: số kết quả bên trái; chuyển dạng xem và Xóa bộ lọc bên phải. Luôn có mặt nên danh sách không nhảy. */}
      {!loading || items.length > 0 ? (
        <div className="d-flex justify-content-between align-items-center mb-2 px-3" style={{ minHeight: 28 }}>
          <span className="small text-muted" aria-live="polite">
            {err ? '' : `${items.length} kết quả${hasMore ? '+' : ''}`}
          </span>
          <div className="d-flex align-items-center gap-2">
            <button type="button" className="lib-filter-clear" onClick={clearFilters}
              style={{ visibility: hasFilter && !mine ? 'visible' : 'hidden' }}
              tabIndex={hasFilter && !mine ? 0 : -1} aria-hidden={!hasFilter || mine}>
              Xóa bộ lọc
            </button>
            <div className="lib-view-toggle" role="group" aria-label="Dạng xem">
              <button type="button" className="lib-view-btn" aria-pressed={view === 'grid'} aria-label="Dạng lưới" title="Dạng lưới" onClick={() => changeView('grid')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
                  <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
                </svg>
              </button>
              <button type="button" className="lib-view-btn" aria-pressed={view === 'list'} aria-label="Dạng danh sách" title="Dạng danh sách" onClick={() => changeView('list')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ minHeight: 28 }} className="mb-2" />
      )}

      {/* Thụt 16px cùng đường lề với tiêu đề, tab và dòng trạng thái */}
      <div className="px-3">{results}</div>
    </Container>
  );
}
