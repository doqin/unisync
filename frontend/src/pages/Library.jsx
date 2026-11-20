// Thư viện tài liệu (FR-DOC-03, FR-DOC-04) – phụ trách: Đức Trọng (ImDT06).
// Duyệt theo môn, lọc theo loại tệp, tìm kiếm từ khóa không dấu. Dữ liệu qua Express (api()).
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, Col, Container, Form, ListGroup, Row, Spinner } from 'react-bootstrap';
import { api } from '../lib/api.js';
import { formatSize } from '../lib/files.js';

const FILE_TYPES = ['pdf', 'docx', 'pptx', 'png', 'jpg', 'webp'];

export default function Library() {
  const [params, setParams] = useSearchParams();
  const group = params.get('group') ?? '';
  const type = params.get('type') ?? '';
  const q = params.get('q') ?? '';

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

  // Đổi bộ lọc → tải lại từ trang 1.
  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(''); setPage(1);
    const qs = new URLSearchParams({ page: '1' });
    if (group) qs.set('group_id', group);
    if (type) qs.set('file_type', type);
    if (q) qs.set('q', q);
    api(`/documents?${qs}`)
      .then((r) => { if (alive) { setItems(r.items); setHasMore(r.has_more); } })
      .catch((e) => alive && setErr(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [group, type, q]);

  function update(patch) {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next);
  }

  async function loadMore() {
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const qs = new URLSearchParams({ page: String(nextPage) });
      if (group) qs.set('group_id', group);
      if (type) qs.set('file_type', type);
      if (q) qs.set('q', q);
      const r = await api(`/documents?${qs}`);
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

  let results;
  if (loading) {
    results = <div className="text-center py-4"><Spinner animation="border" role="status" /><div className="mt-2">Đang tải…</div></div>;
  } else if (err) {
    results = <Alert variant="danger">Không tải được tài liệu: {err}</Alert>;
  } else if (items.length === 0) {
    results = <Alert variant="light" className="mb-0">Không có tài liệu nào{q || group || type ? ' khớp bộ lọc' : ' trong thư viện'}.</Alert>;
  } else {
    results = (
      <>
        <ListGroup>
          {items.map((d) => (
            <ListGroup.Item key={d.id} action as={Link} to={`/library/${d.id}`}>
              <div className="d-flex justify-content-between align-items-start gap-2">
                <div className="fw-semibold text-break">{d.title}</div>
                <Badge bg="secondary" className="text-uppercase">{d.file_type}</Badge>
              </div>
              <div className="small text-muted">
                {subjectName(d.group_id)} · {formatSize(d.file_size)} · {new Date(d.created_at).toLocaleDateString('vi-VN')}
              </div>
            </ListGroup.Item>
          ))}
        </ListGroup>
        {hasMore && (
          <div className="text-center mt-3">
            <Button variant="outline-primary" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Đang tải…' : 'Tải thêm'}
            </Button>
          </div>
        )}
      </>
    );
  }

  return (
    <Container className="py-4">
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <h1 className="h4 mb-0">Thư viện tài liệu</h1>
        <Button as={Link} to="/library/new">Tải lên tài liệu</Button>
      </div>

      <Card body className="mb-3">
        <Form onSubmit={(e) => { e.preventDefault(); update({ q: draftQ.trim() }); }}>
          <Row className="g-2">
            <Col xs={12} md={5}>
              <Form.Control placeholder="Tìm theo tiêu đề, mô tả (không cần dấu)" value={draftQ}
                onChange={(e) => setDraftQ(e.target.value)} aria-label="Tìm kiếm tài liệu" maxLength={200} />
            </Col>
            <Col xs={6} md={3}>
              <Form.Select value={group} onChange={(e) => update({ group: e.target.value })} aria-label="Lọc theo môn">
                <option value="">Tất cả môn</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.code ? `${s.code} – ${s.name}` : s.name}</option>)}
              </Form.Select>
            </Col>
            <Col xs={6} md={2}>
              <Form.Select value={type} onChange={(e) => update({ type: e.target.value })} aria-label="Lọc theo loại tệp">
                <option value="">Mọi loại</option>
                {FILE_TYPES.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
              </Form.Select>
            </Col>
            <Col xs={12} md={2} className="d-grid">
              <Button type="submit" variant="outline-primary">Tìm</Button>
            </Col>
          </Row>
        </Form>
      </Card>

      {results}
    </Container>
  );
}
