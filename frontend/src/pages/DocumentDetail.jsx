// Chi tiết tài liệu (FR-DOC-05, FR-DOC-06, FR-DOC-10) – phụ trách: Đức Trọng (ImDT06).
// Tải xuống bằng signed URL ngắn hạn; người tải lên được sửa thông tin và xóa tài liệu;
// người khác báo cáo được tài liệu vi phạm.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Card, Container, Form, Modal } from 'react-bootstrap';
import { api } from '../lib/api.js';
import { formatSize } from '../lib/files.js';
import { useAuth } from '../context/AuthContext.jsx';
import { pushRecent, removeRecent } from '../lib/recent.js';
import StarRating from '../components/StarRating.jsx';
import BackLink from '../components/BackLink.jsx';
import DocCard from '../components/DocCard.jsx';
import ErrorRetry from '../components/ErrorRetry.jsx';
import FileBadge from '../components/FileBadge.jsx';
import '../styles/library.css';

// Khớp REPORT_REASONS ở backend/src/routes/documents.js. [giá trị, nhãn, gợi ý, biểu tượng]
const REPORT_REASONS = [
  ['copyright', 'Vi phạm bản quyền', 'Sao chép sách, giáo trình, đề thi có bản quyền', 'copyright'],
  ['inappropriate', 'Không phù hợp', 'Phản cảm, xúc phạm hoặc sai lệch', 'alert'],
  ['spam', 'Spam, quảng cáo', 'Liên kết rác, tệp không liên quan', 'ban'],
  ['other', 'Lý do khác', 'Mô tả cụ thể ở ô bên dưới', 'more'],
];
const REPORT_PLACEHOLDERS = {
  copyright: 'Ví dụ: tài liệu chụp lại giáo trình có bản quyền của…',
  inappropriate: 'Nội dung nào không phù hợp, ở trang mấy…',
  spam: 'Tệp quảng cáo gì, không liên quan đến môn học ra sao…',
  other: 'Mô tả vi phạm để quản trị viên xem xét',
};
const svgProps = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
const REASON_ICONS = {
  copyright: <svg {...svgProps}><circle cx="12" cy="12" r="9" /><path d="M14.8 9.5a3.5 3.5 0 1 0 0 5" /></svg>,
  alert: <svg {...svgProps}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>,
  ban: <svg {...svgProps}><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></svg>,
  more: <svg {...svgProps}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>,
};
const EMPTY_REPORT = { reason: 'copyright', detail: '' };

/** Lá cờ báo cáo; `filled` khi đã báo cáo. */
const FlagIcon = ({ filled = false }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" fill={filled ? 'currentColor' : 'none'} />
    <path d="M4 22v-7" />
  </svg>
);

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
  const [reportOpen, setReportOpen] = useState(false);
  const [reportForm, setReportForm] = useState(EMPTY_REPORT);
  const [reportErr, setReportErr] = useState('');

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

  function openReport() {
    setReportForm(EMPTY_REPORT); setReportErr(''); setReportOpen(true);
  }

  async function sendReport(e) {
    e.preventDefault();
    setBusy('report'); setReportErr('');
    try {
      const body = { reason: reportForm.reason };
      const detail = reportForm.detail.trim();
      if (detail) body.detail = detail;
      await api(`/documents/${id}/report`, { method: 'POST', body });
      setDoc((d) => ({ ...d, my_report_pending: true }));
      setReportOpen(false);
      setNotice('Đã gửi báo cáo, quản trị viên sẽ xem xét');
    } catch (e2) {
      if (e2.status === 409) {
        // Đã báo cáo từ trước (ví dụ ở tab khác): coi như đã gửi.
        setDoc((d) => ({ ...d, my_report_pending: true }));
        setReportOpen(false);
        setNotice(e2.message);
      } else {
        setReportErr(e2.details?.fieldErrors?.detail?.[0] ?? e2.message);
      }
    } finally {
      setBusy('');
    }
  }

  const detailRequired = reportForm.reason === 'other';

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
      <ErrorRetry message={err || 'Không tìm thấy tài liệu'} onRetry={() => setReloadKey((k) => k + 1)} />
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
              <FileBadge type={doc.file_type} label={`Tệp ${doc.file_type}`} />
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
              {!isOwner && (doc.my_report_pending ? (
                // Nút mờ kèm chú thích (bọc ngoài vì nút bị vô hiệu không nhận chuột).
                <span className="d-inline-block" title="Bạn đã báo cáo tài liệu này, quản trị viên đang xem xét">
                  <Button variant="outline-danger" className="lib-icon-btn lib-report-btn" disabled style={{ pointerEvents: 'none' }}
                    aria-label="Đã báo cáo vi phạm, đang chờ xem xét">
                    <FlagIcon filled />
                  </Button>
                </span>
              ) : (
                <Button variant="outline-danger" className="lib-icon-btn lib-report-btn" onClick={openReport}
                  disabled={busy !== ''} aria-label="Báo cáo vi phạm" title="Báo cáo vi phạm">
                  <FlagIcon />
                </Button>
              ))}
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
      <BackLink />
      {content}

      {doc && related.length > 0 && (
        <section className="mt-4" aria-label="Tài liệu cùng môn">
          <h2 className="h6 mb-2">Tài liệu cùng môn</h2>
          <div className="d-grid gap-2">
            {related.map((d) => (
              <DocCard key={d.id} doc={d} subject={subject} view="list" />
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

      {/* Modal nằm ngoài .library-page (portal vào body) nên gắn class để dùng chung style thư viện. */}
      <Modal show={reportOpen} onHide={() => busy !== 'report' && setReportOpen(false)} centered
        className="library-page lib-report-modal" aria-labelledby="report-title">
        <Form onSubmit={sendReport}>
          <Modal.Header closeButton={busy !== 'report'} className="border-0 pb-0 align-items-start">
            <div className="d-flex align-items-center gap-3 lib-min-w-0">
              <span className="lib-report-head-icon" aria-hidden="true"><FlagIcon /></span>
              <div className="lib-min-w-0">
                <Modal.Title as="h2" id="report-title" className="h5 mb-0">Báo cáo tài liệu</Modal.Title>
                <div className="small text-muted text-truncate" title={doc?.title}>{doc?.title}</div>
              </div>
            </div>
          </Modal.Header>
          <Modal.Body className="pt-3">
            {reportErr && <Alert variant="danger" className="lib-shake py-2">{reportErr}</Alert>}
            <fieldset disabled={busy === 'report'} className="mb-3">
              <legend className="form-label fs-6 fw-semibold mb-2">Tài liệu này có vấn đề gì?</legend>
              <div className="lib-reason-grid">
                {REPORT_REASONS.map(([value, label, hint, icon]) => (
                  <label key={value} className={`lib-reason${reportForm.reason === value ? ' active' : ''}`}>
                    <input type="radio" name="report-reason" value={value} className="visually-hidden"
                      checked={reportForm.reason === value}
                      onChange={() => setReportForm({ ...reportForm, reason: value })} />
                    <span className="lib-reason-icon" aria-hidden="true">{REASON_ICONS[icon]}</span>
                    <span className="lib-min-w-0">
                      <span className="d-block fw-semibold">{label}</span>
                      <span className="d-block small text-muted">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Form.Group controlId="report-detail">
              <Form.Label className="fw-semibold">
                Mô tả thêm{' '}
                {detailRequired
                  ? <span className="text-danger" aria-hidden="true">*</span>
                  : <span className="text-muted fw-normal">(không bắt buộc)</span>}
              </Form.Label>
              <Form.Control as="textarea" rows={3} maxLength={1000} required={detailRequired}
                value={reportForm.detail} disabled={busy === 'report'}
                placeholder={REPORT_PLACEHOLDERS[reportForm.reason]}
                onChange={(e) => setReportForm({ ...reportForm, detail: e.target.value })} />
              <div className="d-flex justify-content-between gap-2 mt-2 small text-muted">
                <span className="d-inline-flex align-items-center gap-1">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                  Chỉ quản trị viên thấy báo cáo này
                </span>
                <span aria-hidden="true">{reportForm.detail.length}/1000</span>
              </div>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer className="border-0 pt-0">
            <Button variant="outline-secondary" onClick={() => setReportOpen(false)} disabled={busy === 'report'}>
              Hủy
            </Button>
            <Button type="submit" variant="danger" disabled={busy === 'report' || (detailRequired && !reportForm.detail.trim())}>
              {busy === 'report' ? 'Đang gửi…' : 'Gửi báo cáo'}
            </Button>
          </Modal.Footer>
        </Form>
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
