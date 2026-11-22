// Tải lên tài liệu (FR-DOC-01, FR-DOC-02) – phụ trách: Đức Trọng (ImDT06).
// Luồng: xin signed URL từ Express → tải thẳng lên Supabase Storage → Express xác nhận
// (xem backend/src/routes/documents.js). Tệp không đi qua Express (giới hạn 4,5 MB của Vercel).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, Container, Form, ProgressBar, Spinner } from 'react-bootstrap';
import { api } from '../lib/api.js';
import { ACCEPT, checkFile, formatSize } from '../lib/files.js';
import BackLink from '../components/BackLink.jsx';
import FileBadge from '../components/FileBadge.jsx';
import FilterDropdown from '../components/FilterDropdown.jsx';
import '../styles/library.css';

const STEPS = { url: 'Đang chuẩn bị…', upload: 'Đang tải tệp lên…', confirm: 'Đang kiểm tra tệp…', done: 'Đã tải lên!' };

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
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0); // 0–1, tiến trình tải tệp lên Storage
  const fileInput = useRef(null);
  const xhrRef = useRef(null); // yêu cầu tải lên đang chạy, để hủy được
  const doneTimer = useRef(null); // hẹn giờ chuyển trang sau khi tải lên xong
  const dropRef = useRef(null);
  const chipRef = useRef(null);

  // Bỏ tệp đã chọn; xóa giá trị của ô chọn tệp để có thể chọn lại đúng tệp đó.
  function clearFile() {
    setFile(null);
    setFileErr('');
    if (fileInput.current) fileInput.current.value = '';
  }

  // Thẻ tệp bay từ vùng kéo thả vào vị trí của nó (kỹ thuật FLIP: đặt lệch về phía vùng thả rồi trượt về).
  useLayoutEffect(() => {
    const drop = dropRef.current;
    const chip = chipRef.current;
    if (!file || !drop || !chip) return;
    const a = drop.getBoundingClientRect();
    const b = chip.getBoundingClientRect();
    const dx = a.left + a.width / 2 - (b.left + b.width / 2);
    const dy = a.top + a.height / 2 - (b.top + b.height / 2);
    chip.style.transition = 'none';
    chip.style.transform = `translate(${dx}px, ${dy}px) scale(0.85)`;
    chip.style.opacity = '0.3';
    const raf = requestAnimationFrame(() => {
      chip.style.transition = 'transform 0.55s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.35s ease';
      chip.style.transform = '';
      chip.style.opacity = '1';
    });
    return () => cancelAnimationFrame(raf);
  }, [file]);

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

  function pickFileObj(f) {
    if (!f) return;
    setFile(f);
    setFileErr(checkFile(f) ?? '');
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, '').slice(0, 200));
  }

  function pickFile(e) {
    pickFileObj(e.target.files?.[0] ?? null);
  }

  // Tải tệp thẳng lên signed URL bằng XHR để có tiến trình thật (fetch không báo tiến trình tải lên).
  function uploadWithProgress(url, body, contentType, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) onProgress(ev.loaded / ev.total); };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) { onProgress(1); resolve(); }
        else reject(new Error('Tải tệp lên thất bại, hãy thử lại'));
      };
      xhr.onerror = () => reject(new Error('Mất kết nối khi tải tệp lên'));
      xhr.onabort = () => reject(Object.assign(new Error('Đã hủy tải lên'), { aborted: true }));
      xhr.send(body);
    });
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
      setStep('upload'); setProgress(0);
      // Bọc lại với MIME chuẩn (Content-Type khớp với MIME backend trả về, bucket chỉ nhận MIME này).
      await uploadWithProgress(up.signed_url, new Blob([file], { type: up.content_type }), up.content_type, setProgress);
      setStep('confirm');
      const doc = await api('/documents', { method: 'POST', body: { ...meta, path: up.path } });
      setStep('done');
      doneTimer.current = setTimeout(() => nav(`/library/${doc.id}`, { replace: true }), 700);
    } catch (e2) {
      setStep(null);
      if (e2.aborted) { setProgress(0); return; } // người dùng chủ động hủy: không báo lỗi
      setErr(e2.message || 'Có lỗi xảy ra');
    }
  }

  function cancelUpload() {
    xhrRef.current?.abort();
  }

  // Đang tải lên mà đóng tab hoặc tải lại trang thì trình duyệt hỏi lại; rời trang trong ứng dụng thì hủy tải lên.
  useEffect(() => {
    if (step === null) return undefined;
    const warn = (ev) => { ev.preventDefault(); ev.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [step]);
  useEffect(() => () => { xhrRef.current?.abort(); clearTimeout(doneTimer.current); }, []);

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
        {err && <Alert variant="danger" className="lib-shake">{err}</Alert>}
        <Form.Group className="mb-3" controlId="doc-group">
          <Form.Label>Nhóm học phần</Form.Label>
          <FilterDropdown id="doc-group-dd" label="Nhóm học phần" value={groupId}
            onChange={setGroupId}
            options={groups.map((g) => ({ value: g.id, label: g.code ? `${g.code} – ${g.name}` : g.name }))} />
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label htmlFor="doc-file">Tệp</Form.Label>
          <label ref={dropRef} htmlFor="doc-file"
            className={`lib-dropzone ${dragging ? 'dragging' : ''} ${fileErr ? 'is-invalid' : ''}`}
            onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); if (!busy) pickFileObj(e.dataTransfer.files?.[0]); }}>
            <input ref={fileInput} id="doc-file" type="file" accept={ACCEPT} onChange={pickFile} disabled={busy} className="visually-hidden" />
            <span className="lib-dz-icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 16V4M6 10l6-6 6 6" />
                <path d="M4 20h16" />
              </svg>
            </span>
            <span className="fw-semibold text-break">
              {file ? 'Kéo thả hoặc bấm để đổi tệp' : 'Kéo thả tệp vào đây hoặc bấm để chọn'}
            </span>
            <span className="small text-muted">PDF, DOCX, PPTX, PNG, JPG, WEBP · tối đa 10 MB</span>
          </label>
          {file && (
            <div ref={chipRef} className={`lib-file-chip mt-3 ${fileErr ? 'is-invalid' : ''}`}>
              <FileBadge type={file.name.split('.').pop() || ''} />
              <div className="lib-min-w-0 flex-grow-1">
                <div className="fw-semibold text-break">{file.name}</div>
                <div className="small text-muted">{formatSize(file.size)}</div>
              </div>
              <button type="button" className="lib-btn-remove" onClick={clearFile} disabled={busy}
                aria-label="Bỏ tệp này" title="Bỏ tệp này">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          )}
          {step === 'upload' && (
            <ProgressBar now={Math.round(progress * 100)} animated className="mt-2" aria-label="Tiến trình tải tệp lên" />
          )}
          {fileErr && <div className="invalid-feedback d-block">{fileErr}</div>}
        </Form.Group>
        <Form.Group className="mb-3" controlId="lib-doc-title">
          <Form.Label>Tiêu đề</Form.Label>
          <Form.Control value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} disabled={busy} required />
          <Form.Text className="d-block text-end">{title.length}/200</Form.Text>
        </Form.Group>
        <Form.Group className="mb-3" controlId="doc-desc">
          <Form.Label>Mô tả <span className="text-muted">(không bắt buộc)</span></Form.Label>
          <Form.Control as="textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
            maxLength={2000} disabled={busy} />
          <Form.Text className="d-block text-end">{description.length}/2000</Form.Text>
        </Form.Group>
        <div className="d-flex gap-2 flex-wrap">
          <Button type="submit" disabled={busy || !file || !!fileErr || !title.trim() || !groupId}>
            {busy ? (
              <>
                {step === 'done'
                  ? (
                    <svg className="me-2" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  )
                  : <Spinner size="sm" animation="border" className="me-2" />}
                {STEPS[step]}
              </>
            ) : 'Tải lên'}
          </Button>
          {step === 'upload' ? (
            <Button variant="outline-danger" onClick={cancelUpload}>Hủy tải lên</Button>
          ) : (
            <Button as={Link} to="/library" variant="outline-secondary" disabled={busy}>Hủy</Button>
          )}
        </div>
      </Form>
    );
  }

  return (
    <Container className="py-4 library-page" style={{ maxWidth: 720 }}>
      <BackLink />
      <Card body>
        <h1 className="h4 mb-3">Tải lên tài liệu</h1>
        {content}
      </Card>
    </Container>
  );
}
