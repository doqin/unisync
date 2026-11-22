import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button, Container, Nav, Navbar, NavDropdown, OverlayTrigger, Tooltip } from 'react-bootstrap';
import Icon from './Icon.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const mainLinks = [
  ['/home', 'Trang chủ', 'home'], ['/groups', 'Nhóm', 'groups'], ['/library', 'Thư viện', 'library'],
  ['/study', 'Góc học tập', 'study'], ['/teamups', 'Team-up', 'teamup'],
];

// Navbar mở rộng từ 992px. Dưới 992px menu xổ dọc nên luôn có chữ. Từ 992px:
//  • cụm bên phải (tìm kiếm, thông báo, tài khoản) chỉ còn biểu tượng;
//  • 5 mục chính chỉ còn biểu tượng ở 992–1199px (chật), và có chữ từ 1200px trở lên (đủ chỗ).
const DESKTOP = '(min-width: 992px)';
const WIDE = '(min-width: 1200px)';

function useMedia(query) {
  const [on, setOn] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setOn(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return on;
}

/** Nội dung của liên kết: biểu tượng + chữ. Chữ chỉ ẩn trực quan khi CSS yêu cầu, vẫn là tên truy cập. */
const NavContent = ({ icon, label, wide = false }) => (
  <>
    <Icon name={icon} />
    <span className={wide ? 'nav-label nav-label-wide' : 'nav-label'}>{label}</span>
  </>
);

/**
 * Liên kết điều hướng. Khi chỉ còn biểu tượng thì có chú thích (rê chuột 100ms hoặc focus bàn phím, Esc để tắt).
 * `wide`: mục chính, có chữ từ 1200px; mặc định: chỉ biểu tượng từ 992px.
 */
function NavIconLink({ to, label, icon, wide = false, desktop, wideScreen }) {
  const link = (
    <Nav.Link as={NavLink} to={to} className={wide ? 'nav-icon-link nav-icon-link-wide' : 'nav-icon-link'}>
      <NavContent icon={icon} label={label} wide={wide} />
    </Nav.Link>
  );
  const iconOnly = wide ? desktop && !wideScreen : desktop;
  if (!iconOnly) return link;
  return (
    <OverlayTrigger placement="bottom" rootClose delay={{ show: 100, hide: 0 }} overlay={<Tooltip id={`tip-${icon}`}>{label}</Tooltip>}>
      {link}
    </OverlayTrigger>
  );
}

const footerLinks = [
  ['/groups', 'Nhóm học phần'], ['/library', 'Thư viện tài liệu'],
  ['/study', 'Góc học tập'], ['/teamups', 'Tìm đồng đội'],
];

export default function Layout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [expanded, setExpanded] = useState(false);
  const desktop = useMedia(DESKTOP);
  const wideScreen = useMedia(WIDE);
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
              <img src="/logo.svg" alt="" width="32" height="32" className="app-brand-logo" />
              UniSync
            </Navbar.Brand>
            {/* `label`, không phải `aria-label`: react-bootstrap luôn ghi đè aria-label bằng `label` ("Toggle navigation") */}
            <Navbar.Toggle aria-controls="main-nav" label={expanded ? 'Đóng menu' : 'Mở menu'} />
            <Navbar.Collapse id="main-nav">
              {user && (
                <Nav as="nav" aria-label="Điều hướng chính" className="me-auto">
                  {mainLinks.map(([to, label, icon]) => (
                    <NavIconLink key={to} to={to} label={label} icon={icon} wide desktop={desktop} wideScreen={wideScreen} />
                  ))}
                </Nav>
              )}
              <Nav className="ms-auto align-items-lg-center gap-lg-2 py-2 py-lg-0">
                {user ? (
                  <>
                    <NavIconLink to="/search" label="Tìm kiếm" icon="search" desktop={desktop} wideScreen={wideScreen} />
                    <NavIconLink to="/notifications" label="Thông báo" icon="bell" desktop={desktop} wideScreen={wideScreen} />
                    <NavDropdown title={<NavContent icon="user" label="Tài khoản" />} id="account-menu" align="end">
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
