import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Container, Form } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { user, signIn } = useAuth();
  const nav = useNavigate();
  const from = useLocation().state?.from?.pathname ?? '/home';
  const [email, setEmail] = useState('');
  const [needsVerify, setNeedsVerify] = useState(false);
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={from} replace />;

  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) {
      if (error.code === 'email_not_confirmed' || /confirm/i.test(error.message)) {
        setNeedsVerify(true);
        return setErr('Email chưa được xác minh. Hãy mở link trong email xác minh hoặc gửi lại email.');
      }
      return setErr('Email hoặc mật khẩu không đúng');
    }
    nav(from, { replace: true });
  }

  return (
    <Container className="py-5" style={{ maxWidth: 440 }}>
      <Card body>
        <h1 className="h4 mb-3">Đăng nhập</h1>
        <Form onSubmit={submit}>
          {needsVerify && err && <Button as={Link} to="/verify" state={{ email: email.trim().toLowerCase() }} variant="warning" className="w-100 mb-3">Gửi lại email xác minh</Button>}
          {err && <Alert variant="danger">{err}</Alert>}
          <Form.Group className="mb-3" controlId="email"><Form.Label>Email</Form.Label>
            <Form.Control required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Form.Group>
          <Form.Group className="mb-3" controlId="pw"><Form.Label>Mật khẩu</Form.Label>
            <Form.Control required type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></Form.Group>
          <Button type="submit" disabled={busy} className="w-100">{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</Button>
        </Form>
        <p className="small mt-3 mb-0">
          <Link to="/reset-password">Quên mật khẩu?</Link> · <Link to="/register">Tạo tài khoản</Link>
        </p>
      </Card>
    </Container>
  );
}
