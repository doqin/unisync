// Thư viện tài liệu (FR-DOC-03, FR-DOC-04) – phụ trách: Đức Trọng (ImDT06).
// Duyệt theo môn, lọc theo loại tệp, tìm kiếm từ khóa không dấu, sắp xếp. Dữ liệu qua Express (api()).
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, Col, Container, Form, InputGroup, Row } from 'react-bootstrap';
import { api } from '../lib/api.js';
import { formatSize } from '../lib/files.js';
import FilterDropdown from '../components/FilterDropdown.jsx';
import '../styles/library.css';

const FILE_TYPES = ['pdf', 'docx', 'pptx', 'png', 'jpg', 'webp'];

export default function Library() {
  const [params, setParams] = useSearchParams();
  const group = params.get('group') ?? '';
  const type = params.get('type') ?? '';
  const q = params.get('q') ?? '';
  const sort = params.get('sort') ?? 'newest';

  const [subjects, setSubjects] = useState([]);
  const [draftQ, setDraftQ] = useState(q);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api('/documents/subjects').then(setSubjects).catch(() => setSubjects([]));
  }, []);

  const buildQs = (p) => {
    const qs = new URLSearchParams({ page: String(p) });
    if (group) qs.set('group_id', group);
    if (type) qs.set('file_type', type);
    if (q) qs.set('q', q);
    if (sort === 'rating') qs.set('sort', 'rating');
    return qs;
  };

  // Đổi bộ lọc → tải lại từ trang 1.
  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(''); setPage(1);
    const qs = new URLSearchParams({ page: '1' });
    if (group) qs.set('group_id', group);
    if (type) qs.set('file_type', type);
    if (q) qs.set('q', q);
    if (sort === 'rating') qs.set('sort', 'rating');
    api(`/documents?${qs}`)
      .then((r) => { if (alive) { setItems(r.items); setHasMore(r.has_more); } })
      .catch((e) => alive && setErr(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [group, type, q, sort]);

  function update(patch) {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next);
  }

  async function loadMore() {
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const r = await api(`/documents?${buildQs(nextPage)}`);
      setItems((cur) => [...cur, ...r.items]);
      setHasMore(r.has_more);
      setPage(nextPage);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoadingMore(false);
    }
  }

  const subjectName = (id) => {
    const s = subjects.find((x) => x.id === id);
    return s ? (s.code ? `${s.code} – ${s.name}` : s.name) : '';
  };

  // Có bộ lọc hoặc từ khóa đang bật (sắp xếp mặc định "newest" không tính là lọc).
  const hasFilter = Boolean(q || group || type || sort === 'rating');
  function clearFilters() {
    setDraftQ('');
    setParams(new URLSearchParams());
  }

  let results;
  if (loading) {
    results = (
      <Row xs={1} sm={2} lg={3} className="g-3" aria-busy="true" aria-label="Đang tải tài liệu">
        {Array.from({ length: 6 }).map((_, i) => (
          <Col key={i}>
            <Card body className="h-100 border-0 shadow-sm" style={{ borderRadius: 14 }}>
              <div className="d-flex gap-3">
                <div className="skeleton" style={{ width: 48, height: 48 }} />
                <div className="flex-grow-1">
                  <div className="skeleton mb-2" style={{ height: 16, width: '80%' }} />
                  <div className="skeleton" style={{ height: 12, width: '50%' }} />
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    );
  } else if (err) {
    results = <Alert variant="danger">Không tải được tài liệu: {err}</Alert>;
  } else if (items.length === 0) {
    results = (
      <Card body className="text-center py-5 border-0 shadow-sm" style={{ borderRadius: 14 }}>
        <div className="fw-semibold">Không có tài liệu nào{q || group || type ? ' khớp bộ lọc' : ' trong thư viện'}</div>
        <div className="small text-muted">Thử đổi bộ lọc, hoặc là người đầu tiên tải tài liệu lên.</div>
        {hasFilter && (
          <div className="mt-3">
            <Button variant="outline-primary" size="sm" className="rounded-pill px-3" onClick={clearFilters}>Xóa bộ lọc</Button>
          </div>
        )}
      </Card>
    );
  } else {
    results = (
      <>
        <Row xs={1} sm={2} lg={3} className="g-3">
          {items.map((d, i) => (
            <Col key={d.id}>
              <Link to={`/library/${d.id}`} className="doc-card-link text-decoration-none text-reset d-block h-100">
                <Card className="doc-card h-100 fade-up" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                  <Card.Body>
                    <div className="d-flex align-items-start gap-3">
                      <span className={`file-badge file-${d.file_type}`} aria-hidden="true">{d.file_type.toUpperCase()}</span>
                      <div className="min-w-0">
                        <div className="fw-semibold text-break doc-title">{d.title}</div>
                        <div className="small text-muted text-break">{subjectName(d.group_id)}</div>
                      </div>
                    </div>
                    <div className="small text-muted mt-3 d-flex justify-content-between">
                      <span>{formatSize(d.file_size)}</span>
                      <span>{new Date(d.created_at).toLocaleDateString('vi-VN')}</span>
                    </div>
                  </Card.Body>
                </Card>
              </Link>
            </Col>
          ))}
        </Row>
        {hasMore && (
          <div className="text-center mt-4">
            <Button variant="outline-primary" className="rounded-pill px-4" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Đang tải…' : 'Tải thêm'}
            </Button>
          </div>
        )}
      </>
    );
  }

  return (
    <Container className="py-4 library-page">
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3 ps-3">
        <div>
          <h1 className="h4 mb-0">Thư viện tài liệu</h1>
          <div className="small text-muted">Tài liệu học tập do sinh viên đóng góp</div>
        </div>
        <Button as={Link} to="/library/new" className="rounded-pill px-3 d-inline-flex align-items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Tải lên
        </Button>
      </div>

      <Card body className="mb-4 border-0 shadow-sm" style={{ borderRadius: 14 }}>
        <Form onSubmit={(e) => { e.preventDefault(); update({ q: draftQ.trim() }); }}>
          <div className="filter-bar">
            <div className="filter-search">
              <InputGroup className="search-group">
                <InputGroup.Text as="span" className="search-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                </InputGroup.Text>
                <Form.Control placeholder="Tìm tài liệu, môn học…" value={draftQ}
                  onChange={(e) => setDraftQ(e.target.value)} aria-label="Tìm kiếm tài liệu" maxLength={200} />
              </InputGroup>
            </div>
            <div className="filter-subject">
              <FilterDropdown id="flt-subject" label="Lọc theo môn" value={group}
                onChange={(v) => update({ group: v })}
                options={[{ value: '', label: 'Tất cả môn' },
                  ...subjects.map((s) => ({ value: s.id, label: s.code ? `${s.code} – ${s.name}` : s.name }))]} />
            </div>
            <div className="filter-type">
              <FilterDropdown id="flt-type" label="Lọc theo loại tệp" value={type}
                onChange={(v) => update({ type: v })}
                options={[{ value: '', label: 'Tất cả' },
                  ...FILE_TYPES.map((t) => ({ value: t, label: t.toUpperCase() }))]} />
            </div>
            <div className="filter-sort">
              <FilterDropdown id="flt-sort" label="Sắp xếp" value={sort}
                onChange={(v) => update({ sort: v === 'rating' ? 'rating' : '' })}
                options={[{ value: 'newest', label: 'Mới nhất' }, { value: 'rating', label: 'Điểm cao nhất' }]} />
            </div>
            <div className="filter-submit">
              <Button type="submit" variant="primary">Tìm</Button>
            </div>
          </div>
        </Form>
      </Card>

      {hasFilter && (
        <div className="text-end mt-2 mb-3">
          <button type="button" className="filter-clear" onClick={clearFilters}>
            Xóa bộ lọc
          </button>
        </div>
      )}

      {results}
    </Container>
  );
}
