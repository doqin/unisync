import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Card, Container, Form } from 'react-bootstrap';
import { api } from '../lib/api.js';
import { isEduVnEmail } from '../lib/edu.js';

export default function Register() {
  const [f, setF] = useState({ full_name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (!isEduVnEmail(f.email)) return setErr('Vui lòng dùng email trường có đuôi .edu.vn');
    setBusy(true);
    try {
      await api('/auth/register', { method: 'POST', body: f, auth: false });
      setDone(true);
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  }

  return (
    <Container className="py-5" style={{ maxWidth: 440 }}>
      <Card body>
        <h1 className="h4 mb-3">Đăng ký UniSync</h1>
        {done ? (
          <Alert variant="success" className="mb-0">Đã gửi email xác minh. Hãy kiểm tra hộp thư của bạn.</Alert>
        ) : (
          <Form onSubmit={submit}>
            {err && <Alert variant="danger">{err}</Alert>}
            <Form.Group className="mb-3" controlId="name"><Form.Label>Họ và tên</Form.Label>
              <Form.Control required minLength={2} value={f.full_name} onChange={set('full_name')} /></Form.Group>
            <Form.Group className="mb-3" controlId="email"><Form.Label>Email trường (.edu.vn)</Form.Label>
              <Form.Control required type="email" value={f.email} onChange={set('email')} /></Form.Group>
            <Form.Group className="mb-3" controlId="pw"><Form.Label>Mật khẩu</Form.Label>
              <Form.Control required type="password" minLength={8} value={f.password} onChange={set('password')} /></Form.Group>
            <Button type="submit" disabled={busy} className="w-100">{busy ? 'Đang gửi…' : 'Đăng ký'}</Button>
          </Form>
        )}
        <p className="small mt-3 mb-0">Đã có tài khoản? <Link to="/login">Đăng nhập</Link></p>
      </Card>
    </Container>
  );
}
