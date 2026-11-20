// Tải lên tài liệu (FR-DOC-01, FR-DOC-02) – phụ trách: Đức Trọng (ImDT06).
// Luồng: xin signed URL từ Express → tải thẳng lên Supabase Storage → Express xác nhận
// (xem backend/src/routes/documents.js). Tệp không đi qua Express (giới hạn 4,5 MB của Vercel).
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, Container, Form, Spinner } from 'react-bootstrap';
import { api } from '../lib/api.js';
import { supabase } from '../lib/supabase.js';
import { ACCEPT, checkFile, formatSize } from '../lib/files.js';

const STEPS = { url: 'Đang chuẩn bị…', upload: 'Đang tải tệp lên…', confirm: 'Đang kiểm tra tệp…' };

export default function DocumentNew() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [groups, setGroups] = useState(null); // null = đang tải
  const [loadErr, setLoadErr] = useState('');
  const [groupId, setGroupId] = useState(params.get('group') ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState(null);
  const [fileErr, setFileErr] = useState('');
  const [err, setErr] = useState('');
  const [step, setStep] = useState(null);

  useEffect(() => {
    let alive = true;
    api('/documents/my-groups')
      .then((gs) => {
        if (!alive) return;
        setGroups(gs);
        setGroupId((cur) => (gs.some((g) => g.id === cur) ? cur : gs[0]?.id ?? ''));
      })
      .catch((e) => alive && setLoadErr(e.message));
    return () => { alive = false; };
  }, []);

  function pickFile(e) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setFileErr(f ? checkFile(f) ?? '' : '');
    if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, '').slice(0, 200));
  }

  async function submit(e) {
    e.preventDefault();
    setErr('');
    const fe = checkFile(file);
    if (fe) return setFileErr(fe);
    const meta = { group_id: groupId, title: title.trim(), description: description.trim() || undefined };
    try {
      setStep('url');
      const up = await api('/documents/upload-url', {
        method: 'POST',
        body: { ...meta, file_name: file.name, mime_type: file.type || undefined, file_size: file.size },
      });
      setStep('upload');
      // Bọc lại với MIME chuẩn: supabase-js dùng file.type, có thể rỗng với DOCX/PPTX.
      const body = new Blob([file], { type: up.content_type });
      const { error } = await supabase.storage.from('documents').uploadToSignedUrl(up.path, up.token, body);
      if (error) throw new Error('Tải tệp lên thất bại, hãy thử lại');
      setStep('confirm');
      const doc = await api('/documents', { method: 'POST', body: { ...meta, path: up.path } });
      nav(`/library/${doc.id}`, { replace: true });
    } catch (e2) {
      setErr(e2.message || 'Có lỗi xảy ra');
      setStep(null);
    }
  }

  const busy = step !== null;
  let content;
  if (loadErr) {
    content = <Alert variant="danger" className="mb-0">Không tải được danh sách nhóm: {loadErr}</Alert>;
  } else if (groups === null) {
    content = <div className="text-center py-4"><Spinner animation="border" role="status" /><div className="mt-2">Đang tải…</div></div>;
  } else if (groups.length === 0) {
    content = (
      <Alert variant="info" className="mb-0">
        Bạn cần là thành viên đã được duyệt của một nhóm học phần để đăng tài liệu.{' '}
        <Link to="/groups">Tìm nhóm học phần</Link>
      </Alert>
    );
  } else {
    content = (
      <Form onSubmit={submit} noValidate>
        {err && <Alert variant="danger">{err}</Alert>}
        <Form.Group className="mb-3" controlId="doc-group">
          <Form.Label>Nhóm học phần</Form.Label>
          <Form.Select value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={busy} required>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.code ? `${g.code} – ${g.name}` : g.name}</option>)}
          </Form.Select>
        </Form.Group>
        <Form.Group className="mb-3" controlId="doc-file">
          <Form.Label>Tệp</Form.Label>
          <Form.Control type="file" accept={ACCEPT} onChange={pickFile} disabled={busy} isInvalid={!!fileErr} required />
          <Form.Control.Feedback type="invalid">{fileErr}</Form.Control.Feedback>
          <Form.Text>
            {file && !fileErr ? `${file.name} · ${formatSize(file.size)}` : 'PDF, DOCX, PPTX, PNG, JPG, WEBP, tối đa 10 MB'}
          </Form.Text>
        </Form.Group>
        <Form.Group className="mb-3" controlId="doc-title">
          <Form.Label>Tiêu đề</Form.Label>
          <Form.Control value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} disabled={busy} required />
        </Form.Group>
        <Form.Group className="mb-3" controlId="doc-desc">
          <Form.Label>Mô tả <span className="text-muted">(không bắt buộc)</span></Form.Label>
          <Form.Control as="textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
            maxLength={2000} disabled={busy} />
        </Form.Group>
        <div className="d-flex gap-2 flex-wrap">
          <Button type="submit" disabled={busy || !file || !!fileErr || !title.trim() || !groupId}>
            {busy ? <><Spinner size="sm" animation="border" className="me-2" />{STEPS[step]}</> : 'Tải lên'}
          </Button>
          <Button as={Link} to="/library" variant="outline-secondary" disabled={busy}>Hủy</Button>
        </div>
      </Form>
    );
  }

  return (
    <Container className="py-4" style={{ maxWidth: 640 }}>
      <Card body>
        <h1 className="h4 mb-3">Tải lên tài liệu</h1>
        {content}
      </Card>
    </Container>
  );
}
