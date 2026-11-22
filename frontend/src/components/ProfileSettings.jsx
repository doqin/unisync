// Mục "Hồ sơ" trong trang cài đặt (FR-PRO-02): ảnh đại diện + thông tin cá nhân.
// Ảnh: nén ≤ 1 MB → xin signed URL → tải thẳng lên Storage → Express xác nhận (backend/src/routes/profiles.js).
import { useRef, useState } from 'react';
import { Alert, Button, Card, Form } from 'react-bootstrap';
import Avatar from './Avatar.jsx';
import ErrorAlert from './ErrorAlert.jsx';
import LoadingSpinner from './LoadingSpinner.jsx';
import { api } from '../lib/api.js';
import { supabase } from '../lib/supabase.js';
import { AVATAR_ACCEPT, checkAvatarFile, compressAvatar } from '../lib/image.js';

const STEPS = { compress: 'Đang nén ảnh…', url: 'Đang chuẩn bị…', upload: 'Đang tải ảnh lên…', confirm: 'Đang kiểm tra ảnh…' };

const toForm = (p) => ({
  full_name: p.full_name ?? '', school: p.school ?? '', major: p.major ?? '', year: p.year == null ? '' : String(p.year), bio: p.bio ?? '',
});

/** @param {{ profile: object, onChange: (p: object) => void }} props */
export default function ProfileSettings({ profile, onChange }) {
  const [form, setForm] = useState(() => toForm(profile));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [step, setStep] = useState(null);
  const [avatarErr, setAvatarErr] = useState('');
  const fileRef = useRef(null);

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setSaved(false); };

  async function save(e) {
    e.preventDefault();
    setSaveErr('');
    setSaved(false);
    setSaving(true);
    try {
      const year = form.year === '' ? null : Number(form.year);
      const next = await api('/profiles/me', {
        method: 'PATCH',
        body: { full_name: form.full_name, school: form.school, major: form.major, year, bio: form.bio },
      });
      onChange(next);
      setForm(toForm(next));
      setSaved(true);
    } catch (err) {
      setSaveErr(err);
    } finally {
      setSaving(false);
    }
  }

  async function pickAvatar(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // cho phép chọn lại đúng tệp đó sau khi lỗi
    if (!file) return;
    setAvatarErr('');
    const bad = checkAvatarFile(file);
    if (bad) return setAvatarErr(bad);
    try {
      setStep('compress');
      const blob = await compressAvatar(file);
      setStep('url');
      const up = await api('/profiles/me/avatar-url', { method: 'POST', body: { mime_type: blob.type, file_size: blob.size } });
      setStep('upload');
      // Bọc lại với MIME chuẩn do backend trả: supabase-js dùng blob.type.
      const { error } = await supabase.storage.from('images').uploadToSignedUrl(up.path, up.token, new Blob([blob], { type: up.content_type }));
      if (error) throw new Error('Tải ảnh lên thất bại, hãy thử lại');
      setStep('confirm');
      onChange(await api('/profiles/me/avatar', { method: 'POST', body: { path: up.path } }));
    } catch (err) {
      setAvatarErr(err);
    } finally {
      setStep(null);
    }
  }

  const uploading = step !== null;

  return (
    <Card body className="mb-4">
      <h2 className="h5 mb-3">Hồ sơ cá nhân</h2>

      <div className="d-flex align-items-center gap-3 mb-4 flex-wrap">
        <Avatar src={profile.avatar_url} name={profile.full_name} size={96} />
        <div>
          <input ref={fileRef} type="file" accept={AVATAR_ACCEPT} className="d-none" onChange={pickAvatar}
            aria-label="Chọn ảnh đại diện" />
          <Button variant="outline-primary" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? <LoadingSpinner inline label={STEPS[step]} /> : 'Đổi ảnh đại diện'}
          </Button>
          <div className="form-text">PNG, JPG hoặc WEBP. Ảnh được cắt vuông và nén xuống tối đa 1 MB.</div>
        </div>
      </div>
      <ErrorAlert error={avatarErr} title="Chưa đổi được ảnh đại diện" onClose={() => setAvatarErr('')} />

      <Form onSubmit={save} noValidate>
        {saved && <Alert variant="success" dismissible onClose={() => setSaved(false)} closeLabel="Đóng">Đã lưu hồ sơ.</Alert>}
        <ErrorAlert error={saveErr} title="Chưa lưu được hồ sơ" />
        <Form.Group className="mb-3" controlId="pf-name">
          <Form.Label>Họ và tên</Form.Label>
          <Form.Control value={form.full_name} onChange={set('full_name')} minLength={2} maxLength={100} required />
        </Form.Group>
        <Form.Group className="mb-3" controlId="pf-school">
          <Form.Label>Trường</Form.Label>
          <Form.Control value={form.school} onChange={set('school')} maxLength={150} />
        </Form.Group>
        <div className="row">
          <Form.Group className="col-sm-8 mb-3" controlId="pf-major">
            <Form.Label>Ngành</Form.Label>
            <Form.Control value={form.major} onChange={set('major')} maxLength={100} />
          </Form.Group>
          <Form.Group className="col-sm-4 mb-3" controlId="pf-year">
            <Form.Label>Năm học</Form.Label>
            <Form.Select value={form.year} onChange={set('year')}>
              <option value="">Chưa chọn</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((y) => <option key={y} value={y}>Năm {y}</option>)}
            </Form.Select>
          </Form.Group>
        </div>
        <Form.Group className="mb-3" controlId="pf-bio">
          <Form.Label>Giới thiệu</Form.Label>
          <Form.Control as="textarea" rows={3} value={form.bio} onChange={set('bio')} maxLength={500} />
          <Form.Text>{form.bio.length}/500 ký tự</Form.Text>
        </Form.Group>
        <Button type="submit" disabled={saving || form.full_name.trim().length < 2}>
          {saving ? <LoadingSpinner inline label="Đang lưu…" /> : 'Lưu thay đổi'}
        </Button>
      </Form>
    </Card>
  );
}
