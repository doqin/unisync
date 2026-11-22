// Mục "Đổi mật khẩu" trong trang cài đặt (FR-AUTH-05): xác nhận mật khẩu hiện tại rồi đặt mật khẩu mới.
import { useState } from 'react';
import { Alert, Button, Card, Form } from 'react-bootstrap';
import ErrorAlert from './ErrorAlert.jsx';
import LoadingSpinner from './LoadingSpinner.jsx';
import PasswordInputs from './PasswordInputs.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';
import { passwordError, updatePasswordError } from '../lib/password.js';

export default function ChangePassword() {
  const { user } = useAuth();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setDone(false);
    const bad = passwordError(password);
    if (bad) return setErr(bad);
    if (password !== confirm) return setErr('Mật khẩu nhập lại chưa khớp');
    if (password === current) return setErr('Mật khẩu mới phải khác mật khẩu hiện tại');
    setBusy(true);
    try {
      // Xác nhận mật khẩu hiện tại: phiên bị đánh cắp một mình không đủ để đổi mật khẩu.
      const { error: authErr } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
      if (authErr) {
        return setErr(authErr.code === 'over_request_rate_limit'
          ? 'Thao tác quá nhanh, vui lòng thử lại sau ít phút'
          : 'Mật khẩu hiện tại không đúng');
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return setErr(updatePasswordError(error));
      // Đăng xuất các thiết bị khác (giữ phiên này); lỗi bước này không làm hỏng việc đổi mật khẩu.
      await supabase.auth.signOut({ scope: 'others' }).catch(() => {});
      setCurrent(''); setPassword(''); setConfirm('');
      setDone(true);
    } catch {
      setErr('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card body className="mb-4">
      <h2 className="h5 mb-3">Đổi mật khẩu</h2>
      <Form onSubmit={submit} noValidate>
        {done && (
          <Alert variant="success" dismissible onClose={() => setDone(false)} closeLabel="Đóng">
            Đã đổi mật khẩu. Các thiết bị khác đã được đăng xuất.
          </Alert>
        )}
        <ErrorAlert error={err} />
        <Form.Group className="mb-3" controlId="cp-current">
          <Form.Label>Mật khẩu hiện tại</Form.Label>
          <Form.Control type="password" autoComplete="current-password" required value={current}
            onChange={(e) => setCurrent(e.target.value)} disabled={busy} />
        </Form.Group>
        <PasswordInputs idPrefix="cp" password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} disabled={busy} />
        <Button type="submit" disabled={busy || !current || !password || !confirm}>
          {busy ? <LoadingSpinner inline label="Đang đổi…" /> : 'Đổi mật khẩu'}
        </Button>
      </Form>
    </Card>
  );
}
