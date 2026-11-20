// Trang giới thiệu (NFR-01) 
import { useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Badge, Button, Card, Col, Container, Row } from 'react-bootstrap';
import AOS from 'aos';
import 'aos/dist/aos.css';
import { useAuth } from '../context/AuthContext.jsx';

const fadeUp = (delay = 0) => ({ 'data-aos': 'fade-up', 'data-aos-delay': delay || undefined });

const FEATURES = [
  {
    icon: 'feed', title: 'Bảng tin và theo dõi',
    text: 'Đăng bài kèm ảnh, bình luận, thả tim. Theo dõi bạn học; hai người theo dõi nhau sẽ thành Mutual.',
  },
  {
    icon: 'groups', title: 'Nhóm học phần và ngành',
    text: 'Nhóm tạo sẵn cho từng môn học và ngành học. Xin vào nhóm để trao đổi với đúng người cùng lớp.',
  },
  {
    icon: 'library', title: 'Thư viện tài liệu',
    text: 'Chia sẻ đề cương, slide, bài giải theo từng môn. Tìm kiếm không cần gõ dấu, tải về chỉ với một lần bấm.',
  },
  {
    icon: 'study', title: 'Góc học tập',
    text: 'Đồng hồ Pomodoro, thống kê thời gian học và chuỗi ngày học liên tục (streak) để giữ nhịp mỗi ngày.',
  },
  {
    icon: 'teamup', title: 'Tìm đồng đội',
    text: 'Đăng bài tìm thành viên cho bài tập nhóm, đồ án; nhận và duyệt yêu cầu tham gia ngay trong nhóm môn.',
  },
  {
    icon: 'bell', title: 'Thông báo',
    text: 'Biết ngay khi có người theo dõi, thích, bình luận bài của bạn, được duyệt vào nhóm hay có yêu cầu tham gia team-up.',
  },
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

      <section className="py-5" aria-labelledby="features-title">
        <Container>
          <div className="text-center mx-auto mb-4" style={{ maxWidth: 640 }} {...fadeUp()}>
            <h2 id="features-title" className="h2 fw-bold">Mọi thứ bạn cần cho việc học</h2>
            <p className="text-body-secondary mb-0">
              Ngoài mạng xã hội quen thuộc, UniSync có ba công cụ dành riêng cho sinh viên:
              thư viện tài liệu, góc học tập và bảng tìm đồng đội.
            </p>
          </div>
          <Row xs={1} md={2} lg={3} className="g-3 g-lg-4">
            {FEATURES.map((f, i) => (
              <Col key={f.title} {...fadeUp((i % 3) * 100)}>
                <Card className="landing-feature h-100">
                  <Card.Body>
                    <div className="landing-feature-icon mb-3"><Icon name={f.icon} /></div>
                    <h3 className="h5 fw-semibold">{f.title}</h3>
                    <p className="text-body-secondary mb-0">{f.text}</p>
                  </Card.Body>
                </Card>
              </Col>
            ))}
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
