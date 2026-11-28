// Khung soạn bài đăng mới (văn bản 1–5000 ký tự, tối đa 4 ảnh) (FR-SOC-01) – phụ trách: Đức Huy.
// Dùng chung cho trang chủ (/home) và bảng tin nhóm (/groups/:id).
import { useEffect, useId, useRef, useState } from 'react';
import { Button, Card, Form } from 'react-bootstrap';
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
import '../styles/social.css';

const MAX_CONTENT = 5000;

/**
 * @param {object} props
 * @param {string | null} [props.groupId]
 * @param {(post: object) => void} [props.onCreated]
 * @param {string} [props.placeholder]
 */
export default function PostComposer({
  groupId = null,
  onCreated,
  placeholder = 'Bạn đang học gì hoặc muốn chia sẻ điều gì?',
}) {
  const { user, profile } = useAuth();
  const [content, setContent] = useState('');
  const [images, setImages] = useState([]); // [{ id, file, previewUrl }]
  const [err, setErr] = useState('');
  const [statusLabel, setStatusLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const fileInputRef = useRef(null);
  const imagesRef = useRef(images);
  const textId = useId();
  const fileId = useId();

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  // Thu hồi mọi preview URL còn sót khi rời trang.
  useEffect(() => () => {
    for (const item of imagesRef.current) URL.revokeObjectURL(item.previewUrl);
  }, []);

  const displayName = profile?.full_name || user?.user_metadata?.full_name || 'Bạn';

  function handlePickFiles(e) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ''; // cho phép chọn lại cùng file sau khi xóa hoặc lỗi
    if (!picked.length) return;

    setErr('');
    const remaining = MAX_POST_IMAGES - images.length;
    if (remaining <= 0) {
      setErr(`Mỗi bài đăng chỉ được chọn tối đa ${MAX_POST_IMAGES} ảnh.`);
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

    if (accepted.length) setImages((cur) => [...cur, ...accepted]);
    if (problems.length) setErr(problems[0]);
  }

  function removeImage(id) {
    setImages((cur) => {
      const target = cur.find((x) => x.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return cur.filter((x) => x.id !== id);
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) {
      setErr('Vui lòng nhập nội dung bài đăng.');
      return;
    }

    setErr('');
    setBusy(true);
    try {
      const uploadedPaths = [];
      const total = images.length;
      for (let i = 0; i < total; i += 1) {
        const path = await uploadPostImage(images[i].file, (stage) => {
          const suffix = total > 1 ? ` (${i + 1}/${total})` : '';
          if (stage === 'compress') setStatusLabel(`Đang nén ảnh${suffix}…`);
          else if (stage === 'url') setStatusLabel(`Đang chuẩn bị${suffix}…`);
          else setStatusLabel(`Đang tải ảnh lên${suffix}…`);
        });
        uploadedPaths.push(path);
      }

      setStatusLabel('Đang đăng bài…');
      const body = {
        content: trimmed,
        image_urls: uploadedPaths,
        ...(groupId ? { group_id: groupId } : {}),
      };
      const created = await api('/posts', { method: 'POST', body });

      for (const item of images) URL.revokeObjectURL(item.previewUrl);
      setImages([]);
      setContent('');
      onCreated?.(created);
    } catch (ex) {
      setErr(ex);
    } finally {
      setBusy(false);
      setStatusLabel('');
    }
  }

  return (
    <Card body className="soc-post-card soc-composer-card mb-3">
      <Form onSubmit={handleSubmit} noValidate>
        <div className="d-flex align-items-start gap-2 gap-sm-3 mb-2">
          <Avatar src={profile?.avatar_url} name={displayName} size={42} decorative />
          <div className="flex-grow-1" style={{ minWidth: 0 }}>
            <Form.Label htmlFor={textId} className="visually-hidden">Nội dung bài đăng</Form.Label>
            <Form.Control
              id={textId}
              as="textarea"
              rows={3}
              value={content}
              onChange={(e) => { setContent(e.target.value); if (err) setErr(''); }}
              placeholder={placeholder}
              maxLength={MAX_CONTENT}
              className="soc-composer-input"
              readOnly={busy}
              aria-busy={busy}
            />
            <div className="d-flex justify-content-between align-items-center mt-1">
              <span className="small text-body-secondary">
                PNG, JPG hoặc WEBP · tối đa {MAX_POST_IMAGES} ảnh (tự nén ≤ 1 MB)
              </span>
              <span className="small text-body-secondary flex-shrink-0 ms-2">
                {content.length}/{MAX_CONTENT}
              </span>
            </div>
          </div>
        </div>

        <ErrorAlert error={err} title="Chưa đăng được bài" onClose={() => setErr('')} className="mt-2 mb-2" />

        {images.length > 0 && (
          <div className="soc-preview-grid mt-2 mb-3">
            {images.map((item, idx) => (
              <div key={item.id} className="soc-preview-item">
                <img src={item.previewUrl} alt={`Ảnh xem trước ${idx + 1}: ${item.file.name}`} />
                <Button
                  type="button"
                  variant="dark"
                  size="sm"
                  className="soc-preview-remove"
                  disabled={busy}
                  onClick={() => removeImage(item.id)}
                  aria-label={`Bỏ ảnh ${idx + 1}`}
                >
                  ×
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="soc-composer-actions d-flex justify-content-between align-items-center flex-wrap gap-2 mt-3">
          <div>
            <input
              ref={fileInputRef}
              id={fileId}
              type="file"
              accept={POST_IMAGE_ACCEPT}
              multiple
              className="d-none"
              onChange={handlePickFiles}
              aria-label="Chọn ảnh đính kèm bài đăng"
            />
            <Button
              type="button"
              variant="light"
              size="sm"
              className="soc-composer-media-btn"
              disabled={busy || images.length >= MAX_POST_IMAGES}
              onClick={() => fileInputRef.current?.click()}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span>{images.length > 0 ? `Ảnh (${images.length}/${MAX_POST_IMAGES})` : 'Thêm ảnh'}</span>
            </Button>
          </div>
          <Button type="submit" variant="primary" className="px-3 fw-semibold" disabled={busy || !content.trim()}>
            {busy ? <LoadingSpinner inline label={statusLabel || 'Đang đăng…'} /> : 'Đăng bài'}
          </Button>
        </div>
      </Form>
    </Card>
  );
}
