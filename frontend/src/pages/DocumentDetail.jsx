// Chi tiết tài liệu (FR-DOC-05, FR-DOC-06, FR-DOC-10) – phụ trách: Đức Trọng (ImDT06).
// Tải xuống bằng signed URL ngắn hạn; người tải lên được sửa thông tin và xóa tài liệu (Admin cũng xóa được);
// người khác báo cáo được tài liệu vi phạm.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Card, Col, Container, Form, Modal, Row } from 'react-bootstrap';
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

// Khớp REPORT_REASONS ở backend/src/routes/documents.js.
const REPORT_REASONS = [
  ['copyright', 'Vi phạm bản quyền'],
  ['inappropriate', 'Nội dung không phù hợp'],
  ['spam', 'Spam hoặc quảng cáo'],
  ['other', 'Lý do khác'],
];
const REPORT_PLACEHOLDERS = {
  copyright: 'Ví dụ: tài liệu chụp lại giáo trình có bản quyền của…',
  inappropriate: 'Nội dung nào không phù hợp, ở trang mấy…',
  spam: 'Tệp quảng cáo gì, không liên quan đến môn học ra sao…',
  other: 'Mô tả vi phạm để quản trị viên xem xét',
};
const EMPTY_REPORT = { reason: 'copyright', detail: '' };

/** Icon nét mảnh cho các nút ở trang chi tiết. */
const ICONS = {
  download: 'M12 3v12M7 10l5 5 5-5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  link: 'M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5',
};
const ActionIcon = ({ name, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={ICONS[name]} />
  </svg>
);

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
  const { user, profile } = useAuth();
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
  // Admin xóa được tài liệu vi phạm của người khác (FR-DOC-06); backend kiểm tra lại quyền.
  const canDelete = isOwner || profile?.role === 'admin';

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

  // Hiện thông tin mới và đóng form ngay, lưu ở sau; lỗi thì trả lại như cũ và mở lại form (giữ nội dung đã nhập).
  async function save(e) {
    e.preventDefault();
    const body = { title: form.title.trim(), description: form.description.trim() || null };
    const before = { title: doc.title, description: doc.description };
    setErr('');
    setDoc((d) => ({ ...d, ...body }));
    setEditing(false);
    setNotice('Đã lưu thay đổi');
    try {
      const updated = await api(`/documents/${id}`, { method: 'PATCH', body });
      // PATCH chỉ trả hàng documents thô (không có rating_avg, rating_count, my_rating).
      // Gộp vào trạng thái hiện tại thay vì thay thế, để không mất phần đánh giá đã tính từ GET.
      setDoc((d) => ({ ...d, ...updated }));
    } catch (e2) {
      setDoc((d) => ({ ...d, ...before }));
      setNotice('');
      setEditing(true);
      setErr(`Chưa lưu được: ${e2.message}`);
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

  // Tô sao và báo đã ghi nhận ngay khi bấm (lưu lên server mất 1–2 giây), lỗi thì trả lại như cũ.
  // rateSeq: bấm liên tiếp nhiều lần thì chỉ lấy kết quả của lần bấm cuối.
  const rateSeq = useRef(0);
  async function rate(stars) {
    const seq = ++rateSeq.current;
    const before = doc.my_rating;
    setErr('');
    setDoc((d) => ({ ...d, my_rating: stars }));
    setNotice('Đã ghi nhận đánh giá của bạn');
    try {
      await api(`/documents/${id}/rating`, { method: 'PUT', body: { stars } });
      const fresh = await api(`/documents/${id}`); // cập nhật điểm trung bình và số lượt
      if (seq === rateSeq.current) setDoc(fresh);
    } catch (e) {
      if (seq !== rateSeq.current) return;
      setDoc((d) => ({ ...d, my_rating: before }));
      setNotice('');
      setErr(`Chưa lưu được đánh giá: ${e.message}`);
    }
  }

  function openReport() {
    setReportForm(EMPTY_REPORT); setReportErr(''); setReportOpen(true);
  }

  // Đóng hộp, đánh dấu đã báo cáo và báo thành công ngay; gửi ở sau. Lỗi thì trả lại và mở lại hộp (giữ nội dung).
  async function sendReport(e) {
    e.preventDefault();
    const body = { reason: reportForm.reason };
    const detail = reportForm.detail.trim();
    if (detail) body.detail = detail;
    setReportErr('');
    setDoc((d) => ({ ...d, my_report_pending: true }));
    setReportOpen(false);
    setNotice('Đã gửi báo cáo, quản trị viên sẽ xem xét');
    try {
      await api(`/documents/${id}/report`, { method: 'POST', body });
    } catch (e2) {
      if (e2.status === 409) return; // Đã báo cáo từ trước (ví dụ ở tab khác): đúng như đang hiển thị.
      setDoc((d) => ({ ...d, my_report_pending: false }));
      setNotice('');
      setReportErr(e2.details?.fieldErrors?.detail?.[0] ?? `Chưa gửi được báo cáo: ${e2.message}`);
      setReportOpen(true);
    }
  }

  const detailRequired = reportForm.reason === 'other';

  let content;
  // Khung chờ dựng đúng bố cục thật (2 cột, cùng kích thước khối) để trang không giật khi dữ liệu về.
  const bar = (height, width, className = 'mb-2') => (
    <div className={`lib-skeleton ${className}`} style={{ height, width }} />
  );
  const twoColumns = loading || Boolean(doc);

  if (loading) {
    content = (
      <Card className="lib-panel" aria-busy="true" aria-label="Đang tải tài liệu">
        <Card.Body className="p-3 p-sm-4">
          <div className="d-flex align-items-center gap-3 mb-3">
            {bar(32, '55%', '')}
            {bar(26, 52, '')}
          </div>
          {bar(16, '45%', 'mb-3')}
          {bar(14, '70%', 'mb-4')}
          {bar(16, '95%')}
          {bar(16, '60%', '')}
          <hr className="my-4" />
          {bar(22, '65%', 'mb-3')}
          <div className="lib-my-rating">
            {bar(12, 130)}
            {bar(26, 150, '')}
          </div>
        </Card.Body>
      </Card>
    );
  } else if (!doc) {
    content = (
      <ErrorRetry message={err || 'Không tìm thấy tài liệu'} onRetry={() => setReloadKey((k) => k + 1)} />
    );
  } else {
    content = (
      <Card className="lib-panel">
        <Card.Body className="p-3 p-sm-4">
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
                Lưu
              </Button>
              <Button variant="outline-secondary" onClick={() => { setEditing(false); setForm({ title: doc.title, description: doc.description ?? '' }); }} disabled={busy !== ''}>
                Hủy
              </Button>
            </div>
          </Form>
        ) : (
          <>
            <div className="d-flex align-items-center gap-3 flex-wrap mb-2">
              <h1 className="lib-detail-title text-break mb-0">{doc.title}</h1>
              <span className={`lib-type-pill lib-file-${doc.file_type}`} aria-label={`Tệp ${doc.file_type}`}>
                {doc.file_type.toUpperCase()}
              </span>
            </div>
            <div className="text-muted mb-2">
              {doc.uploader_name ? <>Tải lên bởi <span className="fw-semibold text-body">{doc.uploader_name}</span> · </> : null}
              {new Date(doc.created_at).toLocaleDateString('vi-VN')}
            </div>
            <div className="d-flex align-items-center flex-wrap gap-2 small text-muted mb-3">
              {subject && (
                <>
                  <Link to={`/library?group=${doc.group_id}`} className="lib-subject-pill">{subject}</Link>
                  <span aria-hidden="true">•</span>
                </>
              )}
              <span>{formatSize(doc.file_size)}</span>
              <span aria-hidden="true">•</span>
              <span>{doc.download_count ?? 0} lượt tải</span>
            </div>
            {doc.description ? <p className="text-break mb-0" style={{ whiteSpace: 'pre-wrap' }}>{doc.description}</p>
              : <p className="text-muted fst-italic mb-0">Không có mô tả.</p>}
            <hr className="my-4" />
            <div className="d-flex align-items-center gap-2 flex-wrap mb-3">
              <span className="fw-bold">Đánh giá trung bình:</span>
              {doc.rating_count ? (
                <>
                  <span className="fs-5 fw-bold">{doc.rating_avg.toLocaleString('vi-VN')}/5</span>
                  <StarRating value={doc.rating_avg} />
                  <span className="text-muted">({doc.rating_count} lượt đánh giá)</span>
                </>
              ) : <span className="text-muted">Chưa có đánh giá</span>}
            </div>
            <div className="lib-my-rating">
              <div className="lib-my-rating-label">Đánh giá của bạn</div>
              <StarRating value={doc.my_rating ?? 0} onChange={rate} label="Đánh giá của bạn" />
            </div>
          </>
        )}
        </Card.Body>
      </Card>
    );
  }

  return (
    <Container className="py-4 library-page" style={{ maxWidth: twoColumns ? 1080 : 720 }}>
      <BackLink />
      {/* Từ 992px: nội dung bên trái, thao tác và tài liệu cùng môn bên phải; màn hình nhỏ xếp một cột. */}
      <Row className="g-3 align-items-start">
        <Col xs={12} lg={twoColumns ? 8 : 12}>{content}</Col>
        {loading && (
          <Col xs={12} lg={4} aria-hidden="true">
            <Card className="lib-panel mb-3">
              <Card.Body className="d-grid gap-2">
                {bar(48, '100%', '')}
                {bar(44, '100%', '')}
                <div className="lib-action-row mt-1">
                  {bar(36, '100%', '')}
                  {bar(36, '100%', '')}
                </div>
              </Card.Body>
            </Card>
            <Card className="lib-panel p-3">
              {bar(16, 150, 'mb-3')}
              {bar(70, '100%')}
              {bar(70, '100%', '')}
            </Card>
          </Col>
        )}
        {doc && !loading && (
          <Col xs={12} lg={4}>
            {!editing && (
              <Card className="lib-panel mb-3">
                <Card.Body className="d-grid gap-2">
                  <Button className="lib-action lib-action-main" onClick={download} disabled={busy !== ''}>
                    <ActionIcon name="download" />
                    {busy === 'download' ? 'Đang chuẩn bị…' : 'Tải xuống'}
                  </Button>
                  {PREVIEWABLE.includes(doc.file_type) ? (
                    <Button variant="outline-secondary" className="lib-action lib-action-soft" onClick={showPreview} disabled={busy !== ''}>
                      <ActionIcon name="eye" />
                      {busy === 'preview' ? 'Đang tải…' : 'Xem trước'}
                    </Button>
                  ) : (
                    // Nút mờ kèm chú thích: người dùng biết vì sao không xem trước được (tooltip bọc ngoài vì nút bị vô hiệu không nhận chuột).
                    <span className="d-grid" title="Định dạng này không hỗ trợ xem trước, hãy tải xuống để xem">
                      <Button variant="outline-secondary" className="lib-action lib-action-soft" disabled style={{ pointerEvents: 'none' }}>
                        <ActionIcon name="eye" />
                        Xem trước
                      </Button>
                    </span>
                  )}
                  {!PREVIEWABLE.includes(doc.file_type) && (
                    <div className="small text-muted text-center">
                      Tệp {doc.file_type.toUpperCase()} không xem trước được trên trình duyệt, hãy tải xuống để xem.
                    </div>
                  )}
                  <div className="lib-action-row mt-1">
                    <Button variant="outline-secondary" className="lib-action lib-action-sm" onClick={copyLink} disabled={busy !== ''}>
                      <ActionIcon name="link" />
                      Chia sẻ
                    </Button>
                    {isOwner && (
                      <Button variant="outline-secondary" className="lib-action lib-action-sm" onClick={() => { setEditing(true); setNotice(''); }} disabled={busy !== ''}>
                        <ActionIcon name="edit" />
                        Sửa
                      </Button>
                    )}
                    {canDelete && (
                      <Button variant="outline-danger" className="lib-action lib-action-sm" onClick={() => setConfirmDelete(true)} disabled={busy !== ''}>
                        <ActionIcon name="trash" />
                        {busy === 'delete' ? 'Đang xóa…' : 'Xóa'}
                      </Button>
                    )}
                    {!isOwner && (doc.my_report_pending ? (
                      // Nút mờ kèm chú thích (bọc ngoài vì nút bị vô hiệu không nhận chuột).
                      <span className="d-grid" title="Bạn đã báo cáo tài liệu này, quản trị viên đang xem xét">
                        <Button variant="outline-danger" className="lib-action lib-action-sm" disabled style={{ pointerEvents: 'none' }}
                          aria-label="Đã báo cáo vi phạm, đang chờ xem xét">
                          <FlagIcon filled />
                          Đã báo cáo
                        </Button>
                      </span>
                    ) : (
                      <Button variant="outline-danger" className="lib-action lib-action-sm" onClick={openReport}
                        disabled={busy !== ''} title="Báo cáo vi phạm">
                        <FlagIcon />
                        Báo cáo
                      </Button>
                    ))}
                  </div>
                </Card.Body>
              </Card>
            )}
            {related.length > 0 && (
              <section className="card lib-panel p-3" aria-label="Tài liệu cùng môn">
                <h2 className="h6 fw-bold mb-3">Tài liệu cùng môn</h2>
                <div className="d-grid gap-2">
                  {related.map((d) => (
                    <DocCard key={d.id} doc={d} subject={subject} view="list" compact />
                  ))}
                </div>
              </section>
            )}
          </Col>
        )}
      </Row>

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
      <Modal show={reportOpen} onHide={() => setReportOpen(false)} centered
        className="library-page lib-report-modal" aria-labelledby="report-title">
        <Form onSubmit={sendReport}>
          <Modal.Header closeButton className="border-0 pb-0 align-items-start">
            <div className="d-flex align-items-center gap-3 lib-min-w-0">
              <span className="lib-report-head-icon" aria-hidden="true"><FlagIcon /></span>
              <div className="lib-min-w-0">
                <Modal.Title as="h2" id="report-title" className="lib-report-title mb-0">Báo cáo tài liệu</Modal.Title>
                <div className="small text-muted text-truncate" title={doc?.title}>{doc?.title}</div>
              </div>
            </div>
          </Modal.Header>
          <Modal.Body>
            {reportErr && <Alert variant="danger" className="lib-shake py-2">{reportErr}</Alert>}
            <fieldset className="mb-3">
              <legend className="lib-report-label">Tài liệu này có vấn đề gì?</legend>
              {REPORT_REASONS.map(([value, label]) => (
                <Form.Check key={value} type="radio" name="report-reason" id={`report-${value}`} label={label}
                  className="mb-2" checked={reportForm.reason === value}
                  onChange={() => setReportForm({ ...reportForm, reason: value })} />
              ))}
            </fieldset>
            <Form.Group controlId="report-detail">
              <Form.Label className="lib-report-label">
                Mô tả thêm{' '}
                {detailRequired
                  ? <span className="text-danger" aria-hidden="true">*</span>
                  : <span className="text-muted fw-normal">(không bắt buộc)</span>}
              </Form.Label>
              <Form.Control as="textarea" rows={3} maxLength={1000} required={detailRequired}
                value={reportForm.detail}
                placeholder={REPORT_PLACEHOLDERS[reportForm.reason]}
                onChange={(e) => setReportForm({ ...reportForm, detail: e.target.value })} />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer className="lib-report-foot">
            <span className="lib-report-private">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              Chỉ quản trị viên thấy báo cáo này
            </span>
            <div className="d-flex gap-2 ms-auto">
              <Button variant="outline-secondary" size="sm" className="lib-action lib-action-soft lib-report-action" onClick={() => setReportOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" variant="danger" size="sm" className="lib-action lib-report-action" disabled={detailRequired && !reportForm.detail.trim()}>
                Gửi báo cáo
              </Button>
            </div>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={confirmDelete} onHide={() => busy !== 'delete' && setConfirmDelete(false)} centered>
        <Modal.Header closeButton={busy !== 'delete'}>
          <Modal.Title as="h2" className="h5">Xóa tài liệu này?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {!isOwner && <p className="mb-2">Bạn đang xóa tài liệu của người khác với quyền quản trị viên.</p>}
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
