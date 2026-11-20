// Chi tiết tài liệu (FR-DOC-05, FR-DOC-06) – phụ trách: Đức Trọng (ImDT06).
// Tải xuống bằng signed URL ngắn hạn; người tải lên được sửa thông tin và xóa tài liệu.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, Container, Form, Spinner } from 'react-bootstrap';
import { api } from '../lib/api.js';
import { formatSize } from '../lib/files.js';
import { useAuth } from '../context/AuthContext.jsx';

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

  let content;
  if (loading) {
    content = <div className="text-center py-5"><Spinner animation="border" role="status" /><div className="mt-2">Đang tải…</div></div>;
  } else if (!doc) {
    content = <Alert variant="danger">{err || 'Không tìm thấy tài liệu'}</Alert>;
  } else {
    content = (
      <Card body>
        {err && <Alert variant="danger">{err}</Alert>}
        {notice && <Alert variant="success">{notice}</Alert>}
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
              <Badge bg="secondary" className="text-uppercase">{doc.file_type}</Badge>
            </div>
            <div className="small text-muted mb-3">
              {subject && <>{subject} · </>}{formatSize(doc.file_size)} · {new Date(doc.created_at).toLocaleDateString('vi-VN')}
            </div>
            {doc.description ? <p className="text-break" style={{ whiteSpace: 'pre-wrap' }}>{doc.description}</p>
              : <p className="text-muted fst-italic">Không có mô tả.</p>}
            <div className="d-flex gap-2 flex-wrap mt-3">
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
    <Container className="py-4" style={{ maxWidth: 720 }}>
      <Link to="/library" className="d-inline-block mb-3">← Thư viện tài liệu</Link>
      {content}
    </Container>
  );
}
