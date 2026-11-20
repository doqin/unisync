import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button, Container, Nav, Navbar, NavDropdown } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext.jsx';

const mainLinks = [
  ['/home', 'Trang chủ'], ['/groups', 'Nhóm'], ['/library', 'Thư viện'],
  ['/study', 'Góc học tập'], ['/teamups', 'Team-up'],
];

const footerLinks = [
  ['/groups', 'Nhóm học phần'], ['/library', 'Thư viện tài liệu'],
  ['/study', 'Góc học tập'], ['/teamups', 'Tìm đồng đội'],
];

export default function Layout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [expanded, setExpanded] = useState(false);
  const mainRef = useRef(null);
  const firstRender = useRef(true);

  // Đổi trang: đưa focus vào nội dung chính để người dùng bàn phím không kẹt ở navbar.
  useEffect(() => {
    setExpanded(false);
    if (firstRender.current) { firstRender.current = false; return; }
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/', { replace: true });
  };

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Bỏ qua đến nội dung chính</a>

      <header>
        <Navbar
          expand="lg" sticky="top" className="app-navbar border-bottom"
          expanded={expanded} onToggle={setExpanded}
        >
          <Container>
            <Navbar.Brand as={Link} to={user ? '/home' : '/'} className="app-brand">
              <span className="app-brand-mark" aria-hidden="true">U</span>
              UniSync
            </Navbar.Brand>
            <Navbar.Toggle aria-controls="main-nav" aria-label={expanded ? 'Đóng menu' : 'Mở menu'} />
            <Navbar.Collapse id="main-nav">
              {user && (
                <Nav as="nav" aria-label="Điều hướng chính" className="me-auto">
                  {mainLinks.map(([to, label]) => (
                    <Nav.Link key={to} as={NavLink} to={to}>{label}</Nav.Link>
                  ))}
                </Nav>
              )}
              <Nav className="ms-auto align-items-lg-center gap-lg-2 py-2 py-lg-0">
                {user ? (
                  <>
                    <Nav.Link as={NavLink} to="/search">Tìm kiếm</Nav.Link>
                    <Nav.Link as={NavLink} to="/notifications">Thông báo</Nav.Link>
                    <NavDropdown title="Tài khoản" id="account-menu" align="end">
                      <NavDropdown.Item as={Link} to={`/u/${user.id}`}>Hồ sơ của tôi</NavDropdown.Item>
                      <NavDropdown.Item as={Link} to="/settings">Cài đặt</NavDropdown.Item>
                      <NavDropdown.Divider />
                      <NavDropdown.Item as="button" onClick={handleSignOut}>Đăng xuất</NavDropdown.Item>
                    </NavDropdown>
                  </>
                ) : (
                  <div className="d-flex flex-column flex-lg-row gap-2">
                    <Button as={Link} to="/login" variant="outline-primary">Đăng nhập</Button>
                    <Button as={Link} to="/register" variant="primary">Đăng ký</Button>
                  </div>
                )}
              </Nav>
            </Navbar.Collapse>
          </Container>
        </Navbar>
      </header>

      <main id="main-content" ref={mainRef} tabIndex={-1} className="app-main">
        <Outlet />
      </main>

      <footer className="app-footer border-top">
        <Container className="py-4">
          <div className="row gy-3">
            <div className="col-12 col-md-5">
              <p className="fw-bold mb-1">UniSync</p>
              <p className="text-body-secondary small mb-0">
                Mạng xã hội học tập dành cho sinh viên Việt Nam (email .edu.vn).
              </p>
            </div>
            {user && (
              <nav className="col-12 col-md-7" aria-label="Liên kết chân trang">
                <ul className="list-unstyled d-flex flex-wrap gap-3 justify-content-md-end small mb-0">
                  {footerLinks.map(([to, label]) => (
                    <li key={to}><Link to={to} className="footer-link">{label}</Link></li>
                  ))}
                </ul>
              </nav>
            )}
          </div>
          <p className="text-body-secondary small mt-3 mb-0">© 2026 UniSync – Đồ án SE347</p>
        </Container>
      </footer>
    </div>
  );
}
