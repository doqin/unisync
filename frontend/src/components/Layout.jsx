import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button, Container, Dropdown, Nav, Navbar, OverlayTrigger, Tooltip } from 'react-bootstrap';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const mainLinks = [
  ['/home', 'Trang chủ', 'home'], ['/groups', 'Nhóm', 'groups'], ['/library', 'Thư viện', 'library'],
  ['/study', 'Góc học tập', 'study'], ['/teamups', 'Team-up', 'teamup'],
];

// Dưới 992px: thanh trên chỉ có logo + tìm kiếm + thông báo + ảnh đại diện; 5 mục chính nằm ở thanh dưới (chỉ biểu tượng).
// Từ 992px: 5 mục chính nằm ở thanh trên, chỉ biểu tượng ở 992–1199px (chật) và có chữ từ 1200px (đủ chỗ).
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
 * Liên kết điều hướng trên thanh trên. Khi chỉ còn biểu tượng (và có chuột) thì có chú thích: rê chuột 100ms hoặc
 * focus bàn phím, Esc để tắt. `wide`: mục chính, có chữ từ 1200px; mặc định: luôn chỉ biểu tượng.
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
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const desktop = useMedia(DESKTOP);
  const wideScreen = useMedia(WIDE);
  const [scrolled, setScrolled] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const mainRef = useRef(null);
  const firstRender = useRef(true);

  // Đổi trang: đưa focus vào nội dung chính để người dùng bàn phím không kẹt ở thanh điều hướng.
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    const onScrollTop = () => setShowTop(window.scrollY > 400);
    onScrollTop();
    window.addEventListener('scroll', onScrollTop, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('scroll', onScrollTop);
    };
  }, []);

  const scrollToTop = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    mainRef.current?.focus({ preventScroll: true });
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/', { replace: true });
  };

  return (
    <div className={user ? 'app-shell has-bottom-nav' : 'app-shell'}>
      <a href="#main-content" className="skip-link">Bỏ qua đến nội dung chính</a>

      {/* sticky đặt ở <header> (không phải Navbar): phần tử sticky chỉ dính trong phạm vi cha của nó,
          mà <header> chỉ cao bằng Navbar nên Navbar sticky bên trong sẽ cuộn mất. */}
      <header className={`sticky-top app-header${scrolled ? ' is-scrolled' : ''}${pathname === '/' ? ' is-landing' : ''}`}>
        <Navbar className="app-navbar border-bottom">
          <Container>
            <Navbar.Brand as={Link} to={user ? '/home' : '/'} className="app-brand">
              <img src="/logo.svg" alt="" width="32" height="32" className="app-brand-logo" />
              UniSync
            </Navbar.Brand>

            {user && (
              <Nav as="nav" aria-label="Điều hướng chính" className="app-main-nav me-auto d-none d-lg-flex flex-row align-items-center">
                {mainLinks.map(([to, label, icon]) => (
                  <NavIconLink key={to} to={to} label={label} icon={icon} wide desktop={desktop} wideScreen={wideScreen} />
                ))}
              </Nav>
            )}

            {user ? (
              <div className="app-actions ms-auto d-flex align-items-center">
                <NavIconLink to="/search" label="Tìm kiếm" icon="search" desktop={desktop} wideScreen={wideScreen} />
                <NavIconLink to="/notifications" label="Thông báo" icon="bell" desktop={desktop} wideScreen={wideScreen} />
                <Dropdown align="end">
                  <Dropdown.Toggle as="button" type="button" bsPrefix="account-toggle" id="account-menu">
                    <Avatar src={profile?.avatar_url} name={profile?.full_name} size={32} decorative />
                    <span className="nav-label">Tài khoản</span>
                  </Dropdown.Toggle>
                  <Dropdown.Menu>
                    <Dropdown.Item as={Link} to={`/u/${user.id}`}>Hồ sơ của tôi</Dropdown.Item>
                    <Dropdown.Item as={Link} to="/settings">Cài đặt</Dropdown.Item>
                    <Dropdown.Divider />
                    <Dropdown.Item as="button" onClick={handleSignOut}>Đăng xuất</Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>
              </div>
            ) : (
              <div className="ms-auto d-flex gap-2">
                <Button as={Link} to="/login" variant="outline-primary">Đăng nhập</Button>
                <Button as={Link} to="/register" variant="primary">Đăng ký</Button>
              </div>
            )}
          </Container>
        </Navbar>
      </header>

      <main id="main-content" ref={mainRef} tabIndex={-1} className="app-main">
        <Outlet />
      </main>

      <button
        type="button"
        className={`back-to-top${showTop ? ' is-visible' : ''}`}
        onClick={scrollToTop}
        aria-label="Về đầu trang"
        title="Về đầu trang"
        tabIndex={showTop ? 0 : -1}
        aria-hidden={!showTop}
      >
        <Icon name="arrowUp" size={22} />
      </button>

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

      {user && (
        <nav className="bottom-nav d-lg-none" aria-label="Điều hướng chính">
          {mainLinks.map(([to, label, icon]) => (
            <NavLink key={to} to={to} className="bottom-nav-link">
              <span className="bottom-nav-pill"><Icon name={icon} size={24} /></span>
              <span className="visually-hidden">{label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
