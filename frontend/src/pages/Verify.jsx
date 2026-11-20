import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Alert, Button, Card, Container, Form } from 'react-bootstrap';
import { supabase } from '../lib/supabase.js';
import { isEduVnEmail } from '../lib/edu.js';

// Link xác minh của Supabase trả về hash #access_token=…&refresh_token=… (xác minh thành công,
// phiên được tạo) hoặc #error=… (link cũ/quá hạn). Đọc trước khi client Supabase tự dọn hash.
function readHash() {
  const hash = window.location.hash.slice(1);
  return Object.fromEntries(new URLSearchParams(hash));
}

export default function Verify() {
  const { state } = useLocation(); // email được truyền từ trang đăng ký / đăng nhập
  const hash = readHash();
  const [email, setEmail] = useState(state?.email ?? '');
  const [sent, setSent] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const validEmail = isEduVnEmail(email);

  function resendForm() {
    return (
      <>
        <Form onSubmit={resend}>
          <Form.Group className="mb-3" controlId="email">
            <Form.Label>Email trường (.edu.vn)</Form.Label>
            <Form.Control required type="email" value={email} onChange={(e) => setEmail(e.target.value)} isValid={validEmail} />
          </Form.Group>
          <Button type="submit" disabled={busy || !validEmail} className="w-100">
            {busy ? 'Đang gửi…' : 'Gửi lại email xác minh'}
          </Button>
        </Form>
        <p className="small mt-3 mb-0">Chưa có tài khoản? <Link to="/register">Đăng ký</Link></p>
      </>
    );
  }

  async function resend(e) {
    e.preventDefault();
    setErr(''); setSent(''); setBusy(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: `${window.location.origin}/verify` },
      });
      if (error) throw error;
      setSent(`Đã gửi lại email xác minh tới ${email.trim().toLowerCase()}. Hãy kiểm tra hộp thư.`);
    } catch (ex) {
      setErr(ex?.code === 'over_email_send_rate_limit'
        ? 'Đã gửi quá nhiều email, thử lại sau ít phút'
        : 'Gửi lại chưa thành công. Nếu bạn đã xác minh, hãy đăng nhập trực tiếp.');
    } finally {
      setBusy(false);
    }
  }

  let title, body;
  if (hash.error) {
    // Link không hợp lệ hoặc đã dùng: cho gửi lại.
    title = 'Link xác minh không hợp lệ';
    body = (
      <>
        <Alert variant="danger">Link xác minh không hợp lệ hoặc đã hết hạn.</Alert>
        {resendForm()}
      </>
    );
  } else if (hash.access_token) {
    title = 'Email đã được xác minh';
    body = (
      <Alert variant="success" className="mb-0">
        Xác minh thành công. <Link to="/home">Vào trang chủ</Link>
      </Alert>
    );
  } else if (state?.email) {
    title = 'Xác minh email';
    body = (
      <>
        <Alert variant="info">
          Đã gửi email xác minh tới <strong>{email}</strong>. Hãy mở link trong hộp thư để kích hoạt tài khoản.
        </Alert>
        {sent && <Alert variant="success">{sent}</Alert>}
        {err && <Alert variant="danger">{err}</Alert>}
        <p className="small mb-0">Đã nhận email? <Link to="/login">Đăng nhập</Link></p>
      </>
    );
  } else {
    title = 'Xác minh email';
    body = resendForm();
  }

  return (
    <Container className="py-5" style={{ maxWidth: 520 }}>
      <Card body>
        <h1 className="h4 mb-3">{title}</h1>
        {body}
      </Card>
    </Container>
  );
}
