import { Alert, Container } from 'react-bootstrap';

/** Trang giữ chỗ cho tới khi module được cài đặt. */
export default function PageStub({ title, owner, reqs }) {
  return (
    <Container className="py-4">
      <h1 className="h3">{title}</h1>
      <Alert variant="secondary" className="mt-3 mb-0">
        Chưa cài đặt. Phụ trách: <strong>{owner}</strong> · Yêu cầu: {reqs}
      </Alert>
    </Container>
  );
}
