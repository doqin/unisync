// Hồ sơ người dùng /u/:id (FR-PRO-01, FR-PRO-03) – phụ trách: Khang.
// Nút Theo dõi / nhãn Mutual (FR-SOC-05) do issue #16 thêm vào `.profile-actions` ở khối đầu trang.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Card, Container } from 'react-bootstrap';
import AsyncState from '../components/AsyncState.jsx';
import Avatar from '../components/Avatar.jsx';
import EmptyState from '../components/EmptyState.jsx';
import FollowButton, { MutualBadge } from '../components/FollowButton.jsx';
import Icon from '../components/Icon.jsx';
import ProfilePosts from '../components/ProfilePosts.jsx';
import { api } from '../lib/api.js';
import '../styles/profile.css';

const TOAST_MS = 2500;

const chips = (p) => [p.major, p.school, p.year ? `Năm ${p.year}` : null].filter(Boolean);
const num = (n) => Number(n ?? 0).toLocaleString('vi-VN');

/** Giới thiệu: tối đa 3 dòng, có "Xem thêm" khi dài hơn để bài đăng không bị đẩy khỏi màn hình đầu. */
function Bio({ text }) {
  const id = useId();
  const ref = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => { if (!expanded) setOverflows(el.scrollHeight > el.clientHeight + 1); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, expanded]);

  return (
    <div className="profile-bio-wrap">
      <p id={id} ref={ref} className={expanded ? 'profile-bio' : 'profile-bio is-clamped'}>{text}</p>
      {(overflows || expanded) && (
        <button type="button" className="profile-more" aria-expanded={expanded} aria-controls={id}
          onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Thu gọn' : 'Xem thêm'}
        </button>
      )}
    </div>
  );
}

function EduMark() {
  return (
    <p className="profile-edu">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.5 2.5 4.5-5" />
      </svg>
      Tài khoản sinh viên .edu.vn
    </p>
  );
}

export default function Profile() {
  const { id } = useParams();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const showToast = useCallback((t) => {
    clearTimeout(toastTimer.current);
    setToast({ ...t, id: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const load = useCallback(() => {
    let alive = true;
    setProfile(null);
    setError(null);
    Promise.all([api(`/profiles/${id}`), api(`/follows/${id}/status`)])
      .then(([p, st]) => alive && setProfile({
        ...p,
        is_following: Boolean(st?.is_following),
        is_followed_by: Boolean(st?.is_followed_by),
        is_mutual: !p.is_self && Boolean(st?.is_mutual),
        followers_count: st?.followers_count ?? p.followers_count,
        following_count: st?.following_count ?? p.following_count,
      }))
      .catch((e) => alive && setError(e));
    return () => { alive = false; };
  }, [id]);
  useEffect(load, [load]);

  const handleFollowChanged = (st) => {
    setProfile((cur) => (cur ? {
      ...cur,
      is_following: Boolean(st.is_following),
      is_followed_by: Boolean(st.is_followed_by),
      is_mutual: !cur.is_self && Boolean(st.is_mutual),
      followers_count: st.followers_count ?? cur.followers_count,
      following_count: st.following_count ?? cur.following_count,
    } : cur));
  };

  if (error && [400, 404].includes(error.status)) {
    return (
      <Container className="py-5" style={{ maxWidth: 560 }}>
        <h1 className="visually-hidden">Không tìm thấy người dùng</h1>
        <EmptyState title="Không tìm thấy người dùng" message="Hồ sơ không tồn tại hoặc đường dẫn không đúng."
          action={<Button as={Link} to="/home">Về trang chủ</Button>} />
      </Container>
    );
  }

  return (
    <Container className="py-4" style={{ maxWidth: 720 }}>
      <AsyncState loading={!profile && !error} error={error} onRetry={load} errorTitle="Không tải được hồ sơ">
        {profile && (
          <>
            <Card as="section" className="profile-card mb-4" aria-labelledby="profile-name">
              <div className="profile-band" aria-hidden="true" />
              <div className="profile-body">
                <div className="profile-top">
                  <Avatar src={profile.avatar_url} name={profile.full_name} size={96} className="profile-avatar" />
                  <div className="profile-actions">
                    {profile.is_self ? (
                      <Button as={Link} to="/settings" variant="outline-primary" className="profile-edit">
                        Chỉnh sửa hồ sơ
                      </Button>
                    ) : (
                      <>
                        {profile.is_mutual && <MutualBadge className="profile-mutual-badge" />}
                        <FollowButton
                          userId={profile.id}
                          fullName={profile.full_name}
                          isFollowing={profile.is_following}
                          isFollowedBy={profile.is_followed_by}
                          className="profile-edit profile-follow-btn"
                          onChanged={handleFollowChanged}
                          onToast={showToast}
                        />
                      </>
                    )}
                  </div>
                </div>
                <h1 id="profile-name" className="profile-name">{profile.full_name}</h1>
                {chips(profile).length > 0 && (
                  <ul className="profile-chips">
                    {chips(profile).map((c) => <li key={c}>{c}</li>)}
                  </ul>
                )}
                <EduMark />
                <p className="profile-stats">
                  <Link to={`/u/${profile.id}/followers`} state={{ ownerProfile: profile }} className="profile-stat-link">
                    <strong>{num(profile.followers_count)}</strong> người theo dõi
                  </Link>
                  <Link to={`/u/${profile.id}/following`} state={{ ownerProfile: profile }} className="profile-stat-link">
                    <strong>{num(profile.following_count)}</strong> đang theo dõi
                  </Link>
                </p>
                {profile.bio
                  ? <Bio text={profile.bio} />
                  : profile.is_self && (
                    <p className="profile-bio-empty">
                      Bạn chưa viết giới thiệu. <Link to="/settings">Viết giới thiệu</Link>
                    </p>
                  )}
              </div>
            </Card>
            <ProfilePosts userId={profile.id} isSelf={profile.is_self} />
          </>
        )}
      </AsyncState>

      <div className="ui-toast-layer" role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className={`ui-toast${toast.error ? ' ui-toast-error' : ''}`}>
            <Icon name={toast.error ? 'alert' : 'check'} size={18} />
            {toast.text}
          </div>
        )}
      </div>
    </Container>
  );
}
