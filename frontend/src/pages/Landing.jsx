// Trang giới thiệu (NFR-01) 
import { useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Badge, Button, Card, Col, Container, Row } from 'react-bootstrap';
import AOS from 'aos';
import 'aos/dist/aos.css';
import { useAuth } from '../context/AuthContext.jsx';

const fadeUp = (delay = 0) => ({ 'data-aos': 'fade-up', 'data-aos-delay': delay || undefined });

// Nhóm theo cấu trúc SRS mục 3: mạng xã hội (FR-SOC), nhóm (FR-GRP), ba công cụ chuyên biệt (FR-DOC/STU/TEAM).
const GROUPS = [
  { title: 'Mạng xã hội', text: 'Bảng tin · thích, bình luận · theo dõi, Mutual · thông báo' },
  { title: 'Nhóm học phần và ngành', text: 'Nhóm tạo sẵn theo môn và ngành · duyệt thành viên · bảng tin riêng của nhóm' },
  { title: 'Ba công cụ cho sinh viên', text: 'Thư viện tài liệu · Góc học tập Pomodoro · Tìm đồng đội cho đồ án' },
];

// Vị trí trên vòng tròn bán kính 40%, bắt đầu từ đỉnh, đi theo chiều kim đồng hồ.
const ORBIT = [
  { icon: 'feed', title: 'Bảng tin', sub: 'Bài đăng, theo dõi', x: 50, y: 10 },
  { icon: 'groups', title: 'Nhóm', sub: 'Học phần, ngành', x: 84.6, y: 30 },
  { icon: 'library', title: 'Thư viện', sub: 'Tài liệu theo môn', x: 84.6, y: 70 },
  { icon: 'study', title: 'Góc học tập', sub: 'Pomodoro, streak', x: 50, y: 90 },
  { icon: 'teamup', title: 'Team-up', sub: 'Tìm đồng đội', x: 15.4, y: 70 },
  { icon: 'bell', title: 'Thông báo', sub: 'Trong ứng dụng', x: 15.4, y: 30 },
];

const STEPS = [
  { title: 'Đăng ký bằng email trường', text: 'Chỉ nhận email sinh viên kết thúc bằng .edu.vn.' },
  { title: 'Xác minh email', text: 'Mở liên kết trong hộp thư để kích hoạt tài khoản.' },
  { title: 'Vào nhóm và bắt đầu', text: 'Tìm nhóm môn học của bạn, chia sẻ tài liệu và học cùng nhau.' },
];

export default function Landing() {
  const { user, loading } = useAuth();
  const showPage = !loading && !user;

  useEffect(() => {
    if (!showPage) return;
    AOS.init({
      once: true, duration: 700, easing: 'ease-out-cubic', offset: 40,
      disable: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    });
  }, [showPage]);

  if (loading) return null; // tránh nháy trang giới thiệu trước khi chuyển hướng
  if (user) return <Navigate to="/home" replace />;

  return (
    <div className="landing-page">
      <section className="landing-hero" aria-labelledby="landing-title">
        <Container className="py-5">
          <Row className="align-items-center gy-5">
            <Col lg={6}>
              <p className="landing-eyebrow mb-2" {...fadeUp()}>Mạng xã hội học tập cho sinh viên</p>
              <h1 id="landing-title" className="display-5 fw-bold mb-3" {...fadeUp(100)}>
                Học cùng nhau, <span className="text-primary">dễ hơn</span> với UniSync
              </h1>
              <p className="lead text-body-secondary mb-4" {...fadeUp(200)}>
                Kết nối bạn cùng lớp, chia sẻ tài liệu theo môn, tập trung với Pomodoro và tìm đồng đội cho đồ án –
                tất cả ở một nơi.
              </p>
              <div className="d-grid d-sm-flex gap-2 mb-3" {...fadeUp(300)}>
                <Button as={Link} to="/register" size="lg">Đăng ký miễn phí</Button>
                <Button as={Link} to="/login" size="lg" variant="outline-primary">Đăng nhập</Button>
              </div>
              <p className="small text-body-secondary mb-0 d-flex align-items-center gap-2" {...fadeUp(400)}>
                <Icon name="shield" size={18} />
                Chỉ dành cho sinh viên có email <strong className="text-body">.edu.vn</strong>
              </p>
            </Col>
            <Col lg={6} className="d-none d-lg-block">
              <HeroPreview />
            </Col>
          </Row>
        </Container>
      </section>

      <section className="py-5 overflow-hidden" aria-labelledby="features-title">
        <Container>
          <Row className="align-items-center gy-5">
            <Col lg={6}>
              <p className="landing-eyebrow mb-2" {...fadeUp()}>Một tài khoản</p>
              <h2 id="features-title" className="display-6 fw-bold mb-3" {...fadeUp(100)}>
                Một tài khoản.{' '}<br />Đủ mọi việc học.
              </h2>
              <p className="lead text-body-secondary mb-4" {...fadeUp(200)}>
                Đăng nhập một lần bằng email trường: lướt bảng tin, vào nhóm môn, tìm tài liệu,
                học với Pomodoro và tìm đồng đội cho đồ án.
              </p>
              <ul className="list-unstyled mb-0 d-grid gap-2">
                {GROUPS.map((g, i) => (
                  <li key={g.title} className="landing-group" {...fadeUp(250 + i * 100)}>
                    <h3 className="h5 fw-semibold mb-1">{g.title}</h3>
                    <p className="text-body-secondary mb-0">{g.text}</p>
                  </li>
                ))}
              </ul>
            </Col>
            <Col lg={6} className="d-none d-lg-block">
              <FeatureOrbit />
            </Col>
          </Row>
        </Container>
      </section>

      <section className="py-5 landing-steps" aria-labelledby="steps-title">
        <Container>
          <h2 id="steps-title" className="h2 fw-bold text-center mb-4" {...fadeUp()}>Bắt đầu trong 3 bước</h2>
          <Row as="ol" xs={1} md={3} className="g-4 list-unstyled mb-0">
            {STEPS.map((s, i) => (
              <Col as="li" key={s.title} className="text-center" {...fadeUp(i * 150)}>
                <div className="landing-step-number mx-auto mb-3" aria-hidden="true">{i + 1}</div>
                <h3 className="h5 fw-semibold">{s.title}</h3>
                <p className="text-body-secondary mb-0">{s.text}</p>
              </Col>
            ))}
          </Row>
        </Container>
      </section>

      <section className="py-5" aria-labelledby="cta-title">
        <Container>
          <div className="landing-cta text-center rounded-4 px-3 py-5" {...fadeUp()}>
            <h2 id="cta-title" className="h2 fw-bold mb-2">Sẵn sàng học cùng nhau?</h2>
            <p className="mb-4">Tạo tài khoản bằng email trường của bạn chỉ trong một phút.</p>
            <div className="d-grid d-sm-flex justify-content-sm-center gap-2">
              <Button as={Link} to="/register" size="lg" variant="light">Đăng ký ngay</Button>
              <Button as={Link} to="/login" size="lg" variant="outline-light">Tôi đã có tài khoản</Button>
            </div>
          </div>
        </Container>
      </section>
    </div>
  );
}

function FeatureOrbit() {
  return (
    <div className="landing-orbit" aria-hidden="true">
      <div className="landing-orbit-ring landing-orbit-ring-outer" />
      <div className="landing-orbit-ring landing-orbit-ring-inner" />
      <div className="landing-orbit-core" data-aos="zoom-in">
        <span className="app-brand-mark mb-2">U</span>
        <span className="fw-bold">Tài khoản UniSync</span>
      </div>
      {ORBIT.map((o, i) => (
        <div key={o.title} className="landing-orbit-slot" style={{ left: `${o.x}%`, top: `${o.y}%` }}>
          <div className="landing-orbit-pill" data-aos="zoom-in" data-aos-delay={200 + i * 100}>
            <span className="landing-orbit-icon"><Icon name={o.icon} size={18} /></span>
            <span className="d-flex flex-column lh-sm">
              <span className="fw-semibold">{o.title}</span>
              <span className="small text-body-secondary">{o.sub}</span>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function HeroPreview() {
  return (
    <div className="landing-preview" aria-hidden="true">
      <Card className="landing-preview-card shadow-sm" {...fadeUp(300)}>
        <Card.Body>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <span className="fw-semibold">Góc học tập</span>
            <Badge bg="primary">Tập trung</Badge>
          </div>
          <div className="landing-timer">25:00</div>
          <div className="d-flex justify-content-between small text-body-secondary">
            <span>Hôm nay: 1 giờ 40 phút</span>
            <span>Streak: 7 ngày</span>
          </div>
        </Card.Body>
      </Card>
      <Card className="landing-preview-card shadow-sm" {...fadeUp(450)}>
        <Card.Body className="d-flex align-items-center gap-3">
          <div className="landing-feature-icon"><Icon name="library" /></div>
          <div className="flex-grow-1">
            <div className="fw-semibold">Đề cương Cấu trúc dữ liệu</div>
            <div className="small text-body-secondary">PDF · 2,4 MB · ★ 4,8</div>
          </div>
        </Card.Body>
      </Card>
      <Card className="landing-preview-card shadow-sm" {...fadeUp(600)}>
        <Card.Body>
          <div className="d-flex justify-content-between align-items-center mb-1">
            <span className="fw-semibold">Tìm 2 bạn làm đồ án web</span>
            <Badge bg="success">Đang mở</Badge>
          </div>
          <div className="small text-body-secondary">Cần: Frontend, Backend · Còn 2 chỗ</div>
        </Card.Body>
      </Card>
    </div>
  );
}

const ICONS = {
  feed: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  groups: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  library: (
    <>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </>
  ),
  study: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
  teamup: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" />
      <path d="M20 8v6M23 11h-6" />
    </>
  ),
  bell: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></>,
};

function Icon({ name, size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className="flex-shrink-0">
      {ICONS[name]}
    </svg>
  );
}
