// Trang giới thiệu (NFR-01) 
import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Button, Col, Container, Row } from 'react-bootstrap';
import 'aos/dist/aos.css'; // chỉ dùng CSS hiệu ứng; việc kích hoạt tự làm bằng IntersectionObserver
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

  // AOS 2.x chỉ thêm hiệu ứng khi cuộn xuống (không có `mirror`), nên tự bật/tắt lớp `aos-animate`
  // bằng IntersectionObserver: khối nào vào khung nhìn (cuộn lên hay xuống) đều chạy lại hiệu ứng.
  useEffect(() => {
    if (!showPage) return undefined;
    const { body } = document;
    body.dataset.aosDuration = '700';
    body.dataset.aosEasing = 'ease-out-cubic';
    const els = document.querySelectorAll('.landing-page [data-aos]');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let observer;
    if (reduced || !('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('aos-animate'));
    } else {
      observer = new IntersectionObserver((entries) => {
        entries.forEach((e) => e.target.classList.toggle('aos-animate', e.isIntersecting));
      }, { rootMargin: '0px 0px -40px 0px' });
      els.forEach((el) => observer.observe(el));
    }
    return () => {
      observer?.disconnect();
      delete body.dataset.aosDuration;
      delete body.dataset.aosEasing;
    };
  }, [showPage]);

  if (loading) return null; // tránh nháy trang giới thiệu trước khi chuyển hướng
  if (user) return <Navigate to="/home" replace />;

  return (
    <div className="landing-page">
      <section className="landing-hero" aria-labelledby="landing-title">
        <Container className="py-5">
          <Row className="align-items-center gy-5">
            <Col lg={6}>
              <h1 id="landing-title" className="landing-hero-title mb-4" {...fadeUp()}>
                <span className="text-gradient">UniSync</span><br />
                Học cùng nhau, dễ&nbsp;hơn
              </h1>
              <p className="landing-lead mb-4" {...fadeUp(100)}>
                Mạng xã hội học tập cho sinh viên: kết nối bạn cùng lớp, chia sẻ tài liệu theo môn, tập trung
                với Pomodoro và tìm đồng đội cho đồ án – tất cả ở một nơi.
              </p>
              <div className="d-grid d-sm-flex gap-2 mb-3" {...fadeUp(200)}>
                <Button as={Link} to="/register" size="lg" variant="gradient">Đăng ký miễn phí</Button>
                <Button as={Link} to="/login" size="lg" variant="gradient-outline">Đăng nhập</Button>
              </div>
              <p className="small text-body-secondary mb-0 d-flex align-items-center gap-2" {...fadeUp(300)}>
                <Icon name="shield" size={18} />
                Chỉ dành cho sinh viên có email <strong className="text-body">.edu.vn</strong>
              </p>
            </Col>
            <Col lg={6} className="d-none d-lg-block" {...fadeUp(300)}>
              <HeroStack />
            </Col>
          </Row>
        </Container>
      </section>

      <section className="py-5 overflow-hidden" aria-labelledby="features-title">
        <Container>
          <Row className="align-items-center gy-5">
            <Col lg={6}>
              <h2 id="features-title" className="landing-section-title mb-4" {...fadeUp()}>
                <span className="text-gradient">Một tài khoản</span><br />
                Đủ mọi việc học
              </h2>
              <p className="landing-lead mb-4" {...fadeUp(100)}>
                Đăng nhập một lần bằng email trường: lướt bảng tin, vào nhóm môn, tìm tài liệu,
                học với Pomodoro và tìm đồng đội cho đồ án.
              </p>
              <ul className="list-unstyled mb-0 d-grid gap-2">
                {GROUPS.map((g, i) => (
                  <li key={g.title} className="landing-group" {...fadeUp(200 + i * 100)}>
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
          <div className="text-center mb-5">
            <h2 id="steps-title" className="landing-section-title mb-4" {...fadeUp()}>
              <span className="text-gradient">Bắt đầu</span><br />
              chỉ với 3&nbsp;bước
            </h2>
            <p className="landing-lead mx-auto mb-0" {...fadeUp(100)}>
              Từ lúc đăng ký đến khi vào nhóm môn học chỉ mất vài phút.
            </p>
          </div>
          <Row as="ol" xs={1} md={3} className="g-4 list-unstyled mb-0">
            {STEPS.map((s, i) => (
              <Col as="li" key={s.title} className="text-center" {...fadeUp(200 + i * 150)}>
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
            <h2 id="cta-title" className="landing-section-title text-white mb-4">
              <span className="landing-cta-kicker">Sẵn sàng</span><br />
              học cùng nhau?
            </h2>
            <p className="landing-lead landing-cta-lead mx-auto mb-4">
              Tạo tài khoản bằng email trường của bạn chỉ trong một phút.
            </p>
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
        <img src="/logo.svg" alt="" width="32" height="32" className="app-brand-logo mb-2" />
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

// Poster tính năng cho chồng thẻ ở hero (ảnh ở public/images/landing, tỷ lệ 600×680).
// Sửa ảnh thì tăng `?v=` để trình duyệt không dùng bản cũ trong bộ nhớ đệm.
const STACK = [
  { key: 'study', src: '/images/landing/study.svg?v=2', alt: 'Góc học tập: tập trung với Pomodoro và giữ streak mỗi ngày' },
  { key: 'feed', src: '/images/landing/feed.svg?v=2', alt: 'Bảng tin: chia sẻ, thích, bình luận và theo dõi bạn bè' },
  { key: 'library', src: '/images/landing/library.svg?v=2', alt: 'Thư viện: đề cương và slide theo từng môn' },
  { key: 'teamup', src: '/images/landing/teamup.svg?v=2', alt: 'Team-up: tìm đồng đội cho đồ án môn học' },
];

const AUTOPLAY_MS = 4000;

function HeroStack() {
  const [front, setFront] = useState(0);
  const [hovered, setHovered] = useState(false);
  const n = STACK.length;
  const go = (step) => setFront((f) => (f + step + n) % n);

  // Phụ thuộc vào `front` nên mỗi lần chuyển thẻ (tự động hay bấm tay) đều đếm lại từ đầu.
  // Tạm dừng khi rê chuột lên chồng thẻ; không tự chuyển nếu người dùng chọn giảm chuyển động.
  useEffect(() => {
    if (hovered || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const id = setTimeout(() => setFront((f) => (f + 1) % n), AUTOPLAY_MS);
    return () => clearTimeout(id);
  }, [front, hovered, n]);

  return (
    <div className="landing-stack-wrap">
      <div className="landing-stack" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        {STACK.map((c, i) => {
          const d = (i - front + n) % n;
          return (
            <div key={c.key} className={`landing-stack-card${d ? ' is-back' : ''}`}
              data-d={Math.min(d, 3)} style={{ zIndex: 10 - d }}
              onClick={d ? () => setFront(i) : undefined}>
              <img src={c.src} alt={c.alt} width="600" height="680" draggable="false" />
            </div>
          );
        })}
      </div>
      <div className="d-flex justify-content-center gap-2 mt-3">
        <button type="button" className="landing-stack-nav" onClick={() => go(-1)} aria-label="Thẻ trước">
          <Icon name="chevronLeft" size={18} />
        </button>
        <button type="button" className="landing-stack-nav" onClick={() => go(1)} aria-label="Thẻ sau">
          <Icon name="chevronRight" size={18} />
        </button>
      </div>
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
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,};

function Icon({ name, size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className="flex-shrink-0">
      {ICONS[name]}
    </svg>
  );
}
