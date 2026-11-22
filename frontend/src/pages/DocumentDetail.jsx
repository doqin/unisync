// Chi tiết tài liệu (FR-DOC-05, FR-DOC-06) – phụ trách: Đức Trọng (ImDT06).
// Tải xuống bằng signed URL ngắn hạn; người tải lên được sửa thông tin và xóa tài liệu.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Card, Container, Form, Modal } from 'react-bootstrap';
import { api } from '../lib/api.js';
import { formatSize } from '../lib/files.js';
import { useAuth } from '../context/AuthContext.jsx';
import { pushRecent, removeRecent } from '../lib/recent.js';
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0); // tăng lên để tải lại (nút "Thử lại")
  const [related, setRelated] = useState([]); // tài liệu khác cùng môn

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr('');
    Promise.all([api(`/documents/${id}`), api('/documents/subjects').catch(() => [])])
      .then(([d, subjects]) => {
        if (!alive) return;
        setDoc(d);
        pushRecent(d);
        setForm({ title: d.title, description: d.description ?? '' });
        const s = subjects.find((x) => x.id === d.group_id);
        setSubject(s ? (s.code ? `${s.code} – ${s.name}` : s.name) : '');
      })
      .catch((e) => {
        if (e.status === 404) removeRecent(id);
        if (alive) setErr(e.message);
      })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id, reloadKey]);

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
      // PATCH chỉ trả hàng documents thô (không có rating_avg, rating_count, my_rating).
      // Gộp vào trạng thái hiện tại thay vì thay thế, để không mất phần đánh giá đã tính từ GET.
      setDoc((d) => ({ ...d, ...updated }));
      setEditing(false);
      setNotice('Đã lưu thay đổi');
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy('');
    }
  }

  async function remove() {
    setBusy('delete'); setErr('');
    try {
      await api(`/documents/${id}`, { method: 'DELETE' });
      removeRecent(id);
      nav('/library', { replace: true });
    } catch (e) {
      setErr(e.message);
      setBusy('');
      setConfirmDelete(false);
    }
  }

  // Tài liệu cùng môn (bỏ qua nếu lỗi: đây chỉ là gợi ý phụ).
  useEffect(() => {
    if (!doc?.group_id) return undefined;
    let alive = true;
    api(`/documents?group_id=${doc.group_id}&page=1`)
      .then((r) => { if (alive) setRelated(r.items.filter((d) => d.id !== doc.id).slice(0, 4)); })
      .catch(() => alive && setRelated([]));
    return () => { alive = false; };
  }, [doc?.id, doc?.group_id]);

  const PREVIEWABLE = ['pdf', 'png', 'jpg', 'webp'];
  const isImage = doc && ['png', 'jpg', 'webp'].includes(doc.file_type);

  async function copyLink() {
    const url = window.location.href;
    try {
      // Màn hình cảm ứng: dùng hộp chia sẻ của hệ điều hành nếu có; còn lại sao chép vào bộ nhớ tạm.
      if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: doc?.title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setNotice('Đã sao chép liên kết');
    } catch (e) {
      if (e?.name === 'AbortError') return; // người dùng đóng hộp chia sẻ
      setErr('Không sao chép được liên kết, hãy sao chép từ thanh địa chỉ');
    }
  }

  async function showPreview() {
    setBusy('preview'); setErr('');
    try {
      const { url } = await api(`/documents/${id}/preview`);
      setPreview(url);
      setPreviewOpen(true);
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
    content = (
      <Card body aria-busy="true" aria-label="Đang tải tài liệu">
        <div className="lib-skeleton mb-3" style={{ height: 28, width: '70%' }} />
        <div className="lib-skeleton mb-2" style={{ height: 14, width: '40%' }} />
        <div className="lib-skeleton mb-4" style={{ height: 14, width: '55%' }} />
        <div className="lib-skeleton mb-2" style={{ height: 16, width: '90%' }} />
        <div className="lib-skeleton mb-4" style={{ height: 16, width: '60%' }} />
        <div className="d-flex gap-2">
          <div className="lib-skeleton" style={{ height: 38, width: 110 }} />
          <div className="lib-skeleton" style={{ height: 38, width: 110 }} />
        </div>
      </Card>
    );
  } else if (!doc) {
    content = (
      <Alert variant="danger" className="d-flex justify-content-between align-items-center flex-wrap gap-2">
        <span>{err || 'Không tìm thấy tài liệu'}</span>
        <Button variant="outline-danger" size="sm" className="rounded-pill px-3" onClick={() => setReloadKey((k) => k + 1)}>
          Thử lại
        </Button>
      </Alert>
    );
  } else {
    content = (
      <Card body>
        {err && <Alert variant="danger">{err}</Alert>}
        {notice && (
          <div className="lib-toast-layer" aria-live="polite">
          <div className="lib-notice-pill lib-notice-toast" role="status">
            <span className="lib-notice-icon" aria-hidden="true">
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
              <span className={`lib-file-badge lib-file-${doc.file_type}`} aria-label={`Tệp ${doc.file_type}`}>{doc.file_type.toUpperCase()}</span>
            </div>
            <div className="small text-muted mb-1">
              {doc.uploader_name ? <>Tải lên bởi {doc.uploader_name} · </> : null}
              {new Date(doc.created_at).toLocaleDateString('vi-VN')}
            </div>
            <div className="small text-muted mb-3">
              {subject && (
                <>
                  <Link to={`/library?group=${doc.group_id}`} className="lib-subject-link">{subject}</Link>
                  <span> · </span>
                </>
              )}
              {formatSize(doc.file_size)} · {doc.download_count ?? 0} lượt tải
            </div>
            {doc.description ? <p className="text-break" style={{ whiteSpace: 'pre-wrap' }}>{doc.description}</p>
              : <p className="text-muted fst-italic">Không có mô tả.</p>}
            <div className="lib-rating-box mb-3">
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <StarRating value={doc.rating_avg ?? 0} />
                <span className="small text-muted">
                  {doc.rating_count ? `${doc.rating_avg} · ${doc.rating_count} lượt đánh giá` : 'Chưa có đánh giá'}
                </span>
              </div>
              <div className="small text-muted mt-2 mb-1">Đánh giá của bạn</div>
              <StarRating value={doc.my_rating ?? 0} onChange={rate} label="Đánh giá của bạn" />
            </div>
            <div className="d-flex gap-2 flex-wrap mt-3">
              {PREVIEWABLE.includes(doc.file_type) ? (
                <Button variant="outline-secondary" onClick={showPreview} disabled={busy !== ''}>
                  {busy === 'preview' ? 'Đang tải…' : 'Xem trước'}
                </Button>
              ) : (
                // Nút mờ kèm chú thích: người dùng biết vì sao không xem trước được (tooltip bọc ngoài vì nút bị vô hiệu không nhận chuột).
                <span className="d-inline-block" title="Định dạng này không hỗ trợ xem trước, hãy tải xuống để xem">
                  <Button variant="outline-secondary" disabled style={{ pointerEvents: 'none' }}>Xem trước</Button>
                </span>
              )}
              <Button onClick={download} disabled={busy !== ''}>
                {busy === 'download' ? 'Đang chuẩn bị…' : 'Tải xuống'}
              </Button>
              {isOwner && (
                <>
                  <Button variant="outline-primary" onClick={() => { setEditing(true); setNotice(''); }} disabled={busy !== ''}>Sửa</Button>
                  <Button variant="outline-danger" onClick={() => setConfirmDelete(true)} disabled={busy !== ''}>
                    {busy === 'delete' ? 'Đang xóa…' : 'Xóa'}
                  </Button>
                </>
              )}
              <Button variant="outline-secondary" className="lib-icon-btn ms-auto" onClick={copyLink}
                disabled={busy !== ''} aria-label="Sao chép liên kết" title="Sao chép liên kết">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
                  <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
                </svg>
              </Button>
            </div>
            {!PREVIEWABLE.includes(doc.file_type) && (
              <div className="small text-muted mt-2">
                Tệp {doc.file_type.toUpperCase()} không xem trước được trên trình duyệt, hãy tải xuống để xem.
              </div>
            )}
          </>
        )}
      </Card>
    );
  }

  return (
    <Container className="py-4 library-page" style={{ maxWidth: 720 }}>
      <Link to="/library" className="lib-back-link mb-3">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
        Thư viện tài liệu
      </Link>
      {content}

      {doc && related.length > 0 && (
        <section className="mt-4" aria-label="Tài liệu cùng môn">
          <h2 className="h6 mb-2 px-1">Tài liệu cùng môn</h2>
          <div className="d-grid gap-2">
            {related.map((d) => (
              <Link key={d.id} to={`/library/${d.id}`} className="lib-doc-card-link text-decoration-none text-reset">
                <Card body className="lib-doc-card py-2">
                  <div className="d-flex align-items-center gap-3">
                    <span className={`lib-file-badge lib-file-${d.file_type}`} style={{ width: 36, height: 36, fontSize: '0.6rem' }} aria-hidden="true">
                      {d.file_type.toUpperCase()}
                    </span>
                    <div className="lib-min-w-0">
                      <div className="fw-semibold text-break">{d.title}</div>
                      <div className="small text-muted">{formatSize(d.file_size)}</div>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      <Modal show={previewOpen} onHide={() => setPreviewOpen(false)} size="xl" fullscreen="md-down" centered scrollable>
        <Modal.Header closeButton>
          <Modal.Title as="h2" className="h6 text-truncate mb-0">{doc?.title}</Modal.Title>
          {preview && (
            <a href={preview} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-secondary ms-auto me-2">
              Mở ở tab mới
            </a>
          )}
        </Modal.Header>
        <Modal.Body className="p-0 text-center bg-light">
          {preview && (isImage
            ? <img src={preview} alt={`Xem trước ${doc?.title}`} className="img-fluid" />
            : <iframe title={`Xem trước ${doc?.title}`} src={preview} className="w-100 d-block" style={{ height: '75vh', border: 0 }} />)}
        </Modal.Body>
      </Modal>

      <Modal show={confirmDelete} onHide={() => busy !== 'delete' && setConfirmDelete(false)} centered>
        <Modal.Header closeButton={busy !== 'delete'}>
          <Modal.Title as="h2" className="h5">Xóa tài liệu này?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Tài liệu và tệp đính kèm sẽ bị xóa vĩnh viễn, không thể hoàn tác.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setConfirmDelete(false)} disabled={busy === 'delete'}>
            Hủy
          </Button>
          <Button variant="danger" onClick={remove} disabled={busy === 'delete'}>
            {busy === 'delete' ? 'Đang xóa…' : 'Xóa'}
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
}
