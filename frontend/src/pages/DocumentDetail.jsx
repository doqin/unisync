// Chi tiết tài liệu (FR-DOC-05, FR-DOC-06) – phụ trách: Đức Trọng (ImDT06).
// Tải xuống bằng signed URL ngắn hạn; người tải lên được sửa thông tin và xóa tài liệu.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Card, Container, Form, Spinner } from 'react-bootstrap';
import { api } from '../lib/api.js';
import { formatSize } from '../lib/files.js';
import { useAuth } from '../context/AuthContext.jsx';
import StarRating from '../components/StarRating.jsx';
import '../styles/library.css';

export default function DocumentDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [doc, setDoc] = useState(null);
  const [subject, setSubject] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title: '', description: '' });
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');

  // Thông báo nhỏ tự ẩn sau vài giây.
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 2800);
    return () => clearTimeout(t);
  }, [notice]);
  const [preview, setPreview] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr('');
    Promise.all([api(`/documents/${id}`), api('/documents/subjects').catch(() => [])])
      .then(([d, subjects]) => {
        if (!alive) return;
        setDoc(d);
        setForm({ title: d.title, description: d.description ?? '' });
        const s = subjects.find((x) => x.id === d.group_id);
        setSubject(s ? (s.code ? `${s.code} – ${s.name}` : s.name) : '');
      })
      .catch((e) => alive && setErr(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id]);

  const isOwner = doc && user?.id === doc.uploader_id;

  async function download() {
    setBusy('download'); setErr('');
    try {
      const { url } = await api(`/documents/${id}/download`);
      window.location.assign(url);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  }

  async function save(e) {
    e.preventDefault();
    setBusy('save'); setErr(''); setNotice('');
    try {
      const body = { title: form.title.trim() };
      body.description = form.description.trim() || null;
      const updated = await api(`/documents/${id}`, { method: 'PATCH', body });
      setDoc(updated);
      setEditing(false);
      setNotice('Đã lưu thay đổi');
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy('');
    }
  }

  async function remove() {
    if (!window.confirm('Xóa tài liệu này? Thao tác không thể hoàn tác.')) return;
    setBusy('delete'); setErr('');
    try {
      await api(`/documents/${id}`, { method: 'DELETE' });
      nav('/library', { replace: true });
    } catch (e) {
      setErr(e.message);
      setBusy('');
    }
  }

  async function showPreview() {
    setBusy('preview'); setErr('');
    try {
      const { url } = await api(`/documents/${id}/preview`);
      setPreview(url);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  }

  async function rate(stars) {
    setErr(''); setNotice('');
    try {
      await api(`/documents/${id}/rating`, { method: 'PUT', body: { stars } });
      const fresh = await api(`/documents/${id}`);
      setDoc(fresh);
      setNotice('Đã ghi nhận đánh giá của bạn');
    } catch (e) {
      setErr(e.message);
    }
  }

  let content;
  if (loading) {
    content = <div className="text-center py-5"><Spinner animation="border" role="status" /><div className="mt-2">Đang tải…</div></div>;
  } else if (!doc) {
    content = <Alert variant="danger">{err || 'Không tìm thấy tài liệu'}</Alert>;
  } else {
    content = (
      <Card body>
        {err && <Alert variant="danger">{err}</Alert>}
        {notice && (
          <div className="toast-layer" aria-live="polite">
          <div className="notice-pill notice-toast" role="status">
            <span className="notice-icon" aria-hidden="true">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            <span>{notice}</span>
          </div>
          </div>
        )}
        {editing ? (
          <Form onSubmit={save}>
            <Form.Group className="mb-3" controlId="edit-title">
              <Form.Label>Tiêu đề</Form.Label>
              <Form.Control value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                maxLength={200} required disabled={busy !== ''} />
            </Form.Group>
            <Form.Group className="mb-3" controlId="edit-desc">
              <Form.Label>Mô tả</Form.Label>
              <Form.Control as="textarea" rows={3} value={form.description} maxLength={2000}
                onChange={(e) => setForm({ ...form, description: e.target.value })} disabled={busy !== ''} />
            </Form.Group>
            <div className="d-flex gap-2">
              <Button type="submit" disabled={busy !== '' || !form.title.trim()}>
                {busy === 'save' ? 'Đang lưu…' : 'Lưu'}
              </Button>
              <Button variant="outline-secondary" onClick={() => { setEditing(false); setForm({ title: doc.title, description: doc.description ?? '' }); }} disabled={busy !== ''}>
                Hủy
              </Button>
            </div>
          </Form>
        ) : (
          <>
            <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap">
              <h1 className="h4 text-break mb-1">{doc.title}</h1>
              <span className={`file-badge file-${doc.file_type}`} aria-label={`Tệp ${doc.file_type}`}>{doc.file_type.toUpperCase()}</span>
            </div>
            <div className="small text-muted mb-1">
              {doc.uploader_name ? <>Tải lên bởi {doc.uploader_name} · </> : null}
              {new Date(doc.created_at).toLocaleDateString('vi-VN')}
            </div>
            <div className="small text-muted mb-3">
              {subject && (
                <>
                  <Link to={`/library?group=${doc.group_id}`} className="subject-link">{subject}</Link>
                  <span> · </span>
                </>
              )}
              {formatSize(doc.file_size)} · {doc.download_count ?? 0} lượt tải
            </div>
            {doc.description ? <p className="text-break" style={{ whiteSpace: 'pre-wrap' }}>{doc.description}</p>
              : <p className="text-muted fst-italic">Không có mô tả.</p>}
            <div className="rating-box mb-3">
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <StarRating value={doc.rating_avg ?? 0} />
                <span className="small text-muted">
                  {doc.rating_count ? `${doc.rating_avg} · ${doc.rating_count} lượt đánh giá` : 'Chưa có đánh giá'}
                </span>
              </div>
              <div className="small text-muted mt-2 mb-1">Đánh giá của bạn</div>
              <StarRating value={doc.my_rating ?? 0} onChange={rate} label="Đánh giá của bạn" />
            </div>
            {doc.file_type === 'pdf' && preview && (
              <iframe title={`Xem trước ${doc.title}`} src={preview} className="w-100 mb-3 border rounded"
                style={{ height: 520 }} />
            )}
            <div className="d-flex gap-2 flex-wrap mt-3">
              {doc.file_type === 'pdf' && (
                <Button variant="outline-secondary" onClick={showPreview} disabled={busy !== ''}>
                  {busy === 'preview' ? 'Đang tải…' : 'Xem trước'}
                </Button>
              )}
              <Button onClick={download} disabled={busy !== ''}>
                {busy === 'download' ? 'Đang chuẩn bị…' : 'Tải xuống'}
              </Button>
              {isOwner && (
                <>
                  <Button variant="outline-primary" onClick={() => { setEditing(true); setNotice(''); }} disabled={busy !== ''}>Sửa</Button>
                  <Button variant="outline-danger" onClick={remove} disabled={busy !== ''}>
                    {busy === 'delete' ? 'Đang xóa…' : 'Xóa'}
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </Card>
    );
  }

  return (
    <Container className="py-4 library-page" style={{ maxWidth: 720 }}>
      <Link to="/library" className="back-link mb-3">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
        Thư viện tài liệu
      </Link>
      {content}
    </Container>
  );
}
