// Quên / đặt lại mật khẩu (FR-AUTH-04) – phụ trách: Khang.
// Một trang, ba trạng thái theo hash của link trong email:
//   • không có hash        → form nhập email để nhận link;
//   • #…type=recovery      → form đặt mật khẩu mới (Supabase đã tạo phiên khôi phục từ link);
//   • #error=…             → link hết hạn / đã dùng: báo và cho xin link mới.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Card, Container, Form } from 'react-bootstrap';
import BackButton from '../components/BackButton.jsx';
import ErrorAlert from '../components/ErrorAlert.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import PasswordInputs from '../components/PasswordInputs.jsx';
import { supabase } from '../lib/supabase.js';
import { passwordError, updatePasswordError } from '../lib/password.js';

// Đọc hash một lần khi trang mở, trước khi client Supabase tự dọn hash.
const readHash = () => Object.fromEntries(new URLSearchParams(window.location.hash.slice(1)));

function RequestForm({ notice }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sentTo, setSentTo] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErr('');
    const addr = email.trim().toLowerCase();
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(addr, { redirectTo: `${window.location.origin}/reset-password` });
      // Supabase không báo email có tồn tại hay không; ta cũng không tiết lộ điều đó.
      if (error?.code === 'over_email_send_rate_limit' || error?.code === 'over_request_rate_limit') {
        return setErr('Đã gửi quá nhiều email, thử lại sau ít phút');
      }
      if (error) return setErr('Chưa gửi được email, vui lòng thử lại sau');
      setSentTo(addr);
    } catch {
      setErr('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.');
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <Alert variant="success" className="mb-0">
        Nếu <strong>{sentTo}</strong> đã có tài khoản UniSync, một email hướng dẫn đặt lại mật khẩu đã được gửi.
        Hãy kiểm tra hộp thư (kể cả thư rác). Link có thời hạn ngắn.
      </Alert>
    );
  }
  return (
    <Form onSubmit={submit} noValidate>
      {notice}
      <ErrorAlert error={err} />
      <p className="text-body-secondary">Nhập email đã đăng ký, chúng tôi sẽ gửi link đặt lại mật khẩu.</p>
      <Form.Group className="mb-3" controlId="rp-email">
        <Form.Label>Email</Form.Label>
        <Form.Control required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
      </Form.Group>
      <Button type="submit" disabled={busy || !email.trim()} className="w-100">
        {busy ? <LoadingSpinner inline label="Đang gửi…" /> : 'Gửi link đặt lại mật khẩu'}
      </Button>
    </Form>
  );
}

function NewPasswordForm() {
  const [ready, setReady] = useState(null); // null = đang xác lập phiên khôi phục
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  // Client Supabase đổi hash thành phiên khôi phục bất đồng bộ.
  useEffect(() => {
    let alive = true;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (alive && session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN')) setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => { if (alive && data.session) setReady(true); });
    const timer = setTimeout(() => alive && setReady((r) => r ?? false), 5000);
    return () => { alive = false; clearTimeout(timer); sub.subscription.unsubscribe(); };
  }, []);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    const bad = passwordError(password);
    if (bad) return setErr(bad);
    if (password !== confirm) return setErr('Mật khẩu nhập lại chưa khớp');
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return setErr(updatePasswordError(error));
      await supabase.auth.signOut({ scope: 'others' }).catch(() => {});
      setDone(true);
    } catch {
      setErr('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Alert variant="success" className="mb-0">
        Đã đặt lại mật khẩu. Các thiết bị khác đã được đăng xuất. <Link to="/home">Vào trang chủ</Link>
      </Alert>
    );
  }
  if (ready === null) return <LoadingSpinner label="Đang xác minh link…" />;
  if (!ready) {
    return <RequestForm notice={<Alert variant="danger">Link không hợp lệ hoặc đã hết hạn. Hãy xin link mới.</Alert>} />;
  }
  return (
    <Form onSubmit={submit} noValidate>
      <ErrorAlert error={err} />
      <PasswordInputs idPrefix="rp" password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} disabled={busy} />
      <Button type="submit" disabled={busy || !password || !confirm} className="w-100">
        {busy ? <LoadingSpinner inline label="Đang lưu…" /> : 'Đặt lại mật khẩu'}
      </Button>
    </Form>
  );
}

export default function ResetPassword() {
  const [hash] = useState(readHash);
  const recovering = hash.type === 'recovery' && Boolean(hash.access_token);

  let title = 'Quên mật khẩu';
  let body;
  if (hash.error) {
    body = <RequestForm notice={<Alert variant="danger">Link không hợp lệ hoặc đã hết hạn. Hãy xin link mới.</Alert>} />;
  } else if (recovering) {
    title = 'Đặt lại mật khẩu';
    body = <NewPasswordForm />;
  } else {
    body = <RequestForm />;
  }

  return (
    <Container className="py-5" style={{ maxWidth: 440 }}>
      <BackButton fallback="/login" className="mb-2" />
      <Card body>
        <h1 className="h4 mb-3">{title}</h1>
        {body}
        <p className="small mt-3 mb-0"><Link to="/login">Quay lại đăng nhập</Link></p>
      </Card>
    </Container>
  );
}
