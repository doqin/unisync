import { Link, NavLink, Outlet } from 'react-router-dom';
import { Button, Container, Nav, Navbar } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext.jsx';

const links = [
  ['/home', 'Trang chủ'], ['/groups', 'Nhóm'], ['/library', 'Thư viện'],
  ['/study', 'Góc học tập'], ['/teamups', 'Team-up'],
];

export default function Layout() {
  const { user, signOut } = useAuth();
  return (
    <>
      <Navbar expand="lg" bg="white" className="border-bottom" sticky="top">
        <Container>
          <Navbar.Brand as={Link} to={user ? '/home' : '/'} className="fw-bold text-primary">UniSync</Navbar.Brand>
          <Navbar.Toggle aria-controls="main-nav" />
          <Navbar.Collapse id="main-nav">
            {user && (
              <Nav className="me-auto">
                {links.map(([to, label]) => <Nav.Link key={to} as={NavLink} to={to}>{label}</Nav.Link>)}
              </Nav>
            )}
            <Nav className="ms-auto align-items-lg-center gap-2">
              {user ? (
                <>
                  <Nav.Link as={NavLink} to="/search">Tìm kiếm</Nav.Link>
                  <Nav.Link as={NavLink} to="/notifications">Thông báo</Nav.Link>
                  <Nav.Link as={NavLink} to="/settings">Cài đặt</Nav.Link>
                  <Button variant="outline-secondary" size="sm" onClick={signOut}>Đăng xuất</Button>
                </>
              ) : (
                <>
                  <Button as={Link} to="/login" variant="outline-primary" size="sm">Đăng nhập</Button>
                  <Button as={Link} to="/register" variant="primary" size="sm">Đăng ký</Button>
                </>
              )}
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>
      <main><Outlet /></main>
      <footer className="border-top bg-white py-3 text-center text-muted small">
        © 2026 UniSync – SE347
      </footer>
    </>
  );
}
