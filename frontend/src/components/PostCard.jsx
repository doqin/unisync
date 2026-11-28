// Thẻ hiển thị, sửa, xóa và thích bài đăng (FR-SOC-01, FR-SOC-04) – phụ trách: Đức Huy.
// Dùng chung cho Bảng tin (/home), Chi tiết bài đăng (/posts/:id) và Bảng tin nhóm.
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, Dropdown, Form, Modal } from 'react-bootstrap';
import Avatar from './Avatar.jsx';
import ErrorAlert from './ErrorAlert.jsx';
import LoadingSpinner from './LoadingSpinner.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import {
  MAX_POST_IMAGES,
  POST_IMAGE_ACCEPT,
  checkPostImageFile,
  uploadPostImage,
} from '../lib/postImage.js';
import { formatFullDateTime, formatRelativeTime } from '../lib/time.js';
import '../styles/social.css';

const MAX_CONTENT = 5000;

function pairExistingImages(post) {
  const urls = post.image_urls ?? [];
  const paths = post.image_paths ?? [];
  return paths.map((path, i) => ({ path, url: urls[i] })).filter((x) => Boolean(x.url));
}

/**
 * @param {object} props
 * @param {object} props.post
 * @param {(post: object, source?: 'edit' | 'like') => void} [props.onUpdated]
 * @param {(postId: string) => void} [props.onDeleted]
 * @param {() => void} [props.onCommentClick] có thì dùng nút cuộn tới ô bình luận thay vì link (trang chi tiết)
 */
export default function PostCard({ post, onUpdated, onDeleted, onCommentClick }) {
  const { user, profile } = useAuth();
  const isAuthor = user?.id === post.author_id;
  const canDelete = isAuthor || profile?.role === 'admin';
  const authorId = post.author?.id ?? post.author_id;
  const authorName = post.author?.full_name || 'Sinh viên';

  const [showEditModal, setShowEditModal] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [keptImages, setKeptImages] = useState(() => pairExistingImages(post));
  const [addedFiles, setAddedFiles] = useState([]); // [{ id, file, previewUrl }]
  const [editErr, setEditErr] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [editStatus, setEditStatus] = useState('');
  const [showEditConfirm, setShowEditConfirm] = useState(false);

  const [likeBusy, setLikeBusy] = useState(false);
  const [actionErr, setActionErr] = useState('');

  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState('');

  const [lightboxIdx, setLightboxIdx] = useState(null);

  const editFileRef = useRef(null);
  const addedFilesRef = useRef(addedFiles);
  const editTextareaId = useId();
  const editFileId = useId();
  const menuId = useId();

  useEffect(() => {
    addedFilesRef.current = addedFiles;
  }, [addedFiles]);

  useEffect(() => () => {
    for (const item of addedFilesRef.current) URL.revokeObjectURL(item.previewUrl);
  }, []);

  function revokeList(list) {
    for (const item of list) URL.revokeObjectURL(item.previewUrl);
  }

  function startEdit() {
    revokeList(addedFiles);
    setEditContent(post.content);
    setKeptImages(pairExistingImages(post));
    setAddedFiles([]);
    setEditErr('');
    setShowEditConfirm(false);
    setActionErr('');
    setShowEditModal(true);
  }

  function cancelEdit() {
    if (editBusy) return;
    revokeList(addedFiles);
    setAddedFiles([]);
    setEditErr('');
    setShowEditConfirm(false);
    setShowEditModal(false);
  }

  function backToEditModal() {
    if (editBusy) return;
    setShowEditConfirm(false);
    setShowEditModal(true);
  }

  function handlePickEditImages(e) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!picked.length) return;

    setEditErr('');
    const currentTotal = keptImages.length + addedFiles.length;
    const remaining = MAX_POST_IMAGES - currentTotal;
    if (remaining <= 0) {
      setEditErr(`Mỗi bài đăng chỉ được giữ tối đa ${MAX_POST_IMAGES} ảnh.`);
      return;
    }

    const accepted = [];
    const problems = [];
    for (const file of picked) {
      if (accepted.length >= remaining) {
        problems.push(`Chỉ giữ tối đa ${MAX_POST_IMAGES} ảnh cho mỗi bài đăng.`);
        break;
      }
      const bad = checkPostImageFile(file);
      if (bad) {
        problems.push(`${file.name}: ${bad}`);
        continue;
      }
      accepted.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    if (accepted.length) setAddedFiles((cur) => [...cur, ...accepted]);
    if (problems.length) setEditErr(problems[0]);
  }

  function removeKeptImage(path) {
    setKeptImages((cur) => cur.filter((x) => x.path !== path));
  }

  function removeAddedImage(id) {
    setAddedFiles((cur) => {
      const target = cur.find((x) => x.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return cur.filter((x) => x.id !== id);
    });
  }

  function requestSaveEdit(e) {
    e.preventDefault();
    const trimmed = editContent.trim();
    if (!trimmed) {
      setEditErr('Nội dung bài đăng không được trống.');
      return;
    }
    setEditErr('');
    setShowEditModal(false);
    setShowEditConfirm(true);
  }

  async function confirmSaveEdit() {
    const trimmed = editContent.trim();
    if (!trimmed) {
      setShowEditConfirm(false);
      setShowEditModal(true);
      setEditErr('Nội dung bài đăng không được trống.');
      return;
    }

    setEditErr('');
    setEditBusy(true);
    try {
      const uploadedPaths = [];
      const total = addedFiles.length;
      for (let i = 0; i < total; i += 1) {
        const path = await uploadPostImage(addedFiles[i].file, (stage) => {
          const suffix = total > 1 ? ` (${i + 1}/${total})` : '';
          if (stage === 'compress') setEditStatus(`Đang nén ảnh${suffix}…`);
          else if (stage === 'url') setEditStatus(`Đang chuẩn bị${suffix}…`);
          else setEditStatus(`Đang tải ảnh lên${suffix}…`);
        });
        uploadedPaths.push(path);
      }

      setEditStatus('Đang lưu thay đổi…');
      const body = { content: trimmed };
      if (Array.isArray(post.image_paths)) {
        body.image_urls = [...keptImages.map((x) => x.path), ...uploadedPaths];
      }

      const updated = await api(`/posts/${post.id}`, { method: 'PATCH', body });
      revokeList(addedFiles);
      setAddedFiles([]);
      setShowEditConfirm(false);
      setShowEditModal(false);
      onUpdated?.(updated, 'edit');
    } catch (ex) {
      setEditErr(ex);
    } finally {
      setEditBusy(false);
      setEditStatus('');
    }
  }

  async function toggleLike() {
    if (likeBusy) return;
    setActionErr('');
    setLikeBusy(true);
    try {
      const method = post.liked_by_me ? 'DELETE' : 'POST';
      const res = await api(`/posts/${post.id}/like`, { method });
      onUpdated?.({ ...post, liked_by_me: res.liked_by_me, like_count: res.like_count }, 'like');
    } catch (ex) {
      setActionErr(ex);
    } finally {
      setLikeBusy(false);
    }
  }

  async function confirmDelete() {
    setDeleteErr('');
    setDeleting(true);
    try {
      await api(`/posts/${post.id}`, { method: 'DELETE' });
      setShowDelete(false);
      onDeleted?.(post.id);
    } catch (ex) {
      setDeleteErr(ex);
    } finally {
      setDeleting(false);
    }
  }

  const images = post.image_urls ?? [];
  const totalEditImages = keptImages.length + addedFiles.length;
  const gridClass = `soc-img-grid soc-img-grid--${Math.min(images.length, MAX_POST_IMAGES)}`;

  return (
    <article aria-label={`Bài đăng của ${authorName}`}>
      <Card body className="soc-post-card mb-3">
        <div className="d-flex justify-content-between align-items-start gap-2 mb-3">
          <div className="d-flex align-items-center gap-2 gap-sm-3" style={{ minWidth: 0 }}>
            <Link to={`/u/${authorId}`} className="text-decoration-none flex-shrink-0">
              <Avatar src={post.author?.avatar_url} name={authorName} size={42} className="soc-post-avatar" decorative />
            </Link>
            <div style={{ minWidth: 0 }}>
              <div className="d-flex align-items-center flex-wrap gap-2">
                <Link to={`/u/${authorId}`} className="fw-semibold text-reset text-decoration-none text-break soc-author-link">
                  {authorName}
                </Link>
                {post.group?.name && (
                  <Badge as={Link} to={`/groups/${post.group.id}`} bg="primary-subtle" text="primary-emphasis"
                    className="text-decoration-none">
                    {post.group.name}
                  </Badge>
                )}
              </div>
              <div className="small text-body-secondary">
                <Link to={`/posts/${post.id}`} className="text-reset text-decoration-none soc-time-link">
                  <time dateTime={post.created_at} title={formatFullDateTime(post.created_at)}>
                    {formatRelativeTime(post.created_at)}
                  </time>
                </Link>
              </div>
            </div>
          </div>

          {(isAuthor || canDelete) && (
            <Dropdown align="end" className="flex-shrink-0">
              <Dropdown.Toggle
                id={menuId}
                variant="outline-secondary"
                size="sm"
                className="soc-more-btn"
                aria-label="Tùy chọn bài đăng"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
                  <circle cx="5" cy="12" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="19" cy="12" r="2" />
                </svg>
              </Dropdown.Toggle>
              <Dropdown.Menu className="soc-more-menu">
                {isAuthor && (
                  <Dropdown.Item className="soc-menu-item" onClick={startEdit}>
                    Sửa bài viết
                  </Dropdown.Item>
                )}
                {canDelete && (
                  <Dropdown.Item
                    className="soc-menu-item soc-menu-item-danger"
                    onClick={() => { setDeleteErr(''); setShowDelete(true); }}
                  >
                    Xóa bài viết
                  </Dropdown.Item>
                )}
              </Dropdown.Menu>
            </Dropdown>
          )}
        </div>

        <p className="soc-post-content mb-3">{post.content}</p>

        {images.length > 0 && (
          <div className={gridClass}>
            {images.map((url, idx) => (
              <button
                key={url}
                type="button"
                className="soc-img-btn"
                onClick={() => setLightboxIdx(idx)}
                aria-label={`Xem lớn ảnh ${idx + 1} trong bài đăng của ${authorName}`}
              >
                <img src={url} alt={`Ảnh ${idx + 1} trong bài đăng của ${authorName}`} loading="lazy" />
              </button>
            ))}
          </div>
        )}

        <ErrorAlert error={actionErr} onClose={() => setActionErr('')} className="mb-2" />

        <div className="soc-post-actions d-flex align-items-center justify-content-between flex-wrap gap-2">
          <div className="d-flex align-items-center gap-2">
            <button
              type="button"
              className={`soc-action-btn${post.liked_by_me ? ' is-liked' : ''}`}
              aria-pressed={Boolean(post.liked_by_me)}
              aria-label={post.liked_by_me ? `Bỏ thích bài đăng (${post.like_count ?? 0} lượt thích)` : `Thích bài đăng (${post.like_count ?? 0} lượt thích)`}
              title={post.liked_by_me ? 'Bỏ thích' : 'Thích'}
              disabled={likeBusy}
              onClick={toggleLike}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill={post.liked_by_me ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
                className="soc-action-heart"
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              <span>{post.like_count ?? 0}</span>
            </button>

            {onCommentClick ? (
              <button
                type="button"
                className="soc-action-btn"
                aria-label={`Bình luận (${post.comment_count ?? 0} bình luận)`}
                title="Bình luận"
                onClick={onCommentClick}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
                <span>{post.comment_count ?? 0}</span>
              </button>
            ) : (
              <Link
                to={`/posts/${post.id}`}
                className="soc-action-btn text-decoration-none"
                aria-label={`Bình luận (${post.comment_count ?? 0} bình luận)`}
                title="Bình luận"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
                <span>{post.comment_count ?? 0}</span>
              </Link>
            )}
          </div>
        </div>
      </Card>

      <Modal show={showEditModal} onHide={cancelEdit} size="lg" centered>
        <Modal.Header closeButton={!editBusy} closeLabel="Đóng">
          <Modal.Title className="h5">Chỉnh sửa bài đăng</Modal.Title>
        </Modal.Header>
        <Form onSubmit={requestSaveEdit} noValidate>
          <Modal.Body>
            <Form.Label htmlFor={editTextareaId} className="visually-hidden">Chỉnh sửa nội dung bài đăng</Form.Label>
            <Form.Control
              id={editTextareaId}
              as="textarea"
              rows={5}
              className="soc-textarea-fixed"
              value={editContent}
              onChange={(e) => { setEditContent(e.target.value); if (editErr) setEditErr(''); }}
              maxLength={MAX_CONTENT}
              disabled={editBusy}
            />
            <div className="text-end small text-body-secondary mt-1">
              {editContent.length}/{MAX_CONTENT}
            </div>

            {Array.isArray(post.image_paths) && (
              <>
                {totalEditImages > 0 && (
                  <div className="soc-preview-grid mt-2 mb-2">
                    {keptImages.map((item, idx) => (
                      <div key={item.path} className="soc-preview-item">
                        <img src={item.url} alt={`Ảnh hiện có ${idx + 1}`} />
                        <Button
                          type="button"
                          variant="dark"
                          size="sm"
                          className="soc-preview-remove"
                          disabled={editBusy}
                          onClick={() => removeKeptImage(item.path)}
                          aria-label={`Gỡ ảnh hiện có ${idx + 1}`}
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                    {addedFiles.map((item, idx) => (
                      <div key={item.id} className="soc-preview-item">
                        <img src={item.previewUrl} alt={`Ảnh mới ${idx + 1}: ${item.file.name}`} />
                        <Button
                          type="button"
                          variant="dark"
                          size="sm"
                          className="soc-preview-remove"
                          disabled={editBusy}
                          onClick={() => removeAddedImage(item.id)}
                          aria-label={`Bỏ ảnh mới ${idx + 1}`}
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-2">
                  <input
                    ref={editFileRef}
                    id={editFileId}
                    type="file"
                    accept={POST_IMAGE_ACCEPT}
                    multiple
                    className="d-none"
                    onChange={handlePickEditImages}
                    aria-label="Thêm ảnh khi sửa bài"
                  />
                  <Button
                    type="button"
                    variant="outline-primary"
                    size="sm"
                    className="soc-composer-media-btn"
                    disabled={editBusy || totalEditImages >= MAX_POST_IMAGES}
                    onClick={() => editFileRef.current?.click()}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    <span>Thêm ảnh ({totalEditImages}/{MAX_POST_IMAGES})</span>
                  </Button>
                </div>
              </>
            )}

            <ErrorAlert error={editErr} title="Chưa lưu được bài đăng" onClose={() => setEditErr('')} className="mt-2 mb-0" />
          </Modal.Body>
          <Modal.Footer>
            <Button type="button" variant="outline-secondary" disabled={editBusy} onClick={cancelEdit}>
              Hủy
            </Button>
            <Button type="submit" disabled={editBusy || !editContent.trim()}>
              Lưu thay đổi
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={showEditConfirm} onHide={backToEditModal} centered>
        <Modal.Header closeButton={!editBusy} closeLabel="Đóng">
          <Modal.Title className="h5">Xác nhận chỉnh sửa bài đăng?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-2">Các thay đổi về nội dung và hình ảnh sẽ được cập nhật lên bài đăng.</p>
          <ErrorAlert error={editErr} title="Chưa lưu được bài đăng" onClose={() => setEditErr('')} className="mb-0" />
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="outline-secondary" disabled={editBusy} onClick={backToEditModal}>
            Hủy
          </Button>
          <Button type="button" variant="primary" disabled={editBusy} onClick={confirmSaveEdit}>
            {editBusy ? <LoadingSpinner inline label={editStatus || 'Đang lưu…'} /> : 'Xác nhận lưu'}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showDelete} onHide={() => !deleting && setShowDelete(false)} centered>
        <Modal.Header closeButton={!deleting} closeLabel="Đóng">
          <Modal.Title className="h5">Xóa bài đăng?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-2">Bài đăng và các bình luận, lượt thích kèm theo sẽ bị xóa vĩnh viễn.</p>
          <ErrorAlert error={deleteErr} title="Chưa xóa được bài" onClose={() => setDeleteErr('')} className="mb-0" />
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="outline-secondary" disabled={deleting} onClick={() => setShowDelete(false)}>
            Hủy
          </Button>
          <Button type="button" variant="danger" disabled={deleting} onClick={confirmDelete}>
            {deleting ? <LoadingSpinner inline label="Đang xóa…" /> : 'Xóa bài'}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={lightboxIdx !== null} onHide={() => setLightboxIdx(null)} size="lg" centered>
        <Modal.Header closeButton closeLabel="Đóng">
          <Modal.Title className="h6">
            Ảnh {(lightboxIdx ?? 0) + 1}/{images.length} · {authorName}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center bg-body-tertiary">
          {lightboxIdx !== null && images[lightboxIdx] && (
            <img
              src={images[lightboxIdx]}
              alt={`Ảnh ${(lightboxIdx ?? 0) + 1} trong bài đăng của ${authorName}`}
              className="soc-lightbox-img rounded"
            />
          )}
        </Modal.Body>
      </Modal>
    </article>
  );
}
