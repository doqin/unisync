// Hai ô mật khẩu mới + nhập lại, dùng ở trang đặt lại mật khẩu và mục đổi mật khẩu trong cài đặt.
import { Form } from 'react-bootstrap';
import { MAX_PASSWORD, MIN_PASSWORD } from '../lib/password.js';

/** @param {{ idPrefix: string, password: string, confirm: string, onPassword: (v: string) => void, onConfirm: (v: string) => void, disabled?: boolean }} props */
export default function PasswordInputs({ idPrefix, password, confirm, onPassword, onConfirm, disabled }) {
  const mismatch = confirm.length > 0 && confirm !== password;
  return (
    <>
      <Form.Group className="mb-3" controlId={`${idPrefix}-new`}>
        <Form.Label>Mật khẩu mới</Form.Label>
        <Form.Control type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} maxLength={MAX_PASSWORD}
          value={password} onChange={(e) => onPassword(e.target.value)} disabled={disabled} aria-describedby={`${idPrefix}-new-help`} />
        <Form.Text id={`${idPrefix}-new-help`}>Tối thiểu {MIN_PASSWORD} ký tự.</Form.Text>
      </Form.Group>
      <Form.Group className="mb-3" controlId={`${idPrefix}-confirm`}>
        <Form.Label>Nhập lại mật khẩu mới</Form.Label>
        <Form.Control type="password" autoComplete="new-password" required maxLength={MAX_PASSWORD}
          value={confirm} onChange={(e) => onConfirm(e.target.value)} disabled={disabled} isInvalid={mismatch} />
        <Form.Control.Feedback type="invalid">Mật khẩu nhập lại chưa khớp</Form.Control.Feedback>
      </Form.Group>
    </>
  );
}
