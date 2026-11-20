// Trang 404 (NFR-07) – phụ trách: Minh Trọng (minhtrong2921).
import { Link } from 'react-router-dom';
import { Button, Container } from 'react-bootstrap';
import EmptyState from '../components/EmptyState.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function NotFound() {
  const { user } = useAuth();
  return (
    <Container className="py-5" style={{ maxWidth: 560 }}>
      <h1 className="visually-hidden">Không tìm thấy trang</h1>
      <EmptyState
        title="Không tìm thấy trang"
        message="Đường dẫn không tồn tại hoặc đã bị xóa."
        action={<Button as={Link} to={user ? '/home' : '/'}>{user ? 'Về trang chủ' : 'Về trang giới thiệu'}</Button>}
      />
    </Container>
  );
}
