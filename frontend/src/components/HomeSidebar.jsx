// Cột phụ trang chủ Dashboard: thẻ hồ sơ nhanh, lối tắt màu sắc và gợi ý kết nối (FR-SOC-02, FR-SOC-05).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card } from 'react-bootstrap';
import Avatar from './Avatar.jsx';
import FollowButton from './FollowButton.jsx';
import Icon from './Icon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';

export const CAMPUS_SHORTCUTS = [
  { to: '/study', label: 'Góc học tập', icon: 'study' },
  { to: '/library', label: 'Thư viện', icon: 'library' },
  { to: '/groups', label: 'Nhóm học phần', icon: 'groups' },
  { to: '/teamups', label: 'Team-up', icon: 'teamup' },
];

function shortReason(u) {
  const r = u.reason;
  if (r?.follows_me) return 'Đang theo dõi bạn';
  if (r?.mutual_count > 0) return `${r.mutual_count} bạn chung`;
  if (r?.same_major) return 'Cùng ngành học';
  if (r?.same_school) return 'Cùng trường';
  return [u.major, u.school].filter(Boolean).join(' · ') || 'Sinh viên .edu.vn';
}

export default function HomeSidebar({ onToast }) {
  const { user, profile } = useAuth();
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSug, setLoadingSug] = useState(true);

  const userId = profile?.id ?? user?.id;
  const displayName = profile?.full_name || user?.user_metadata?.full_name || 'Sinh viên';
  const metaText = [profile?.major, profile?.school, profile?.year ? `Năm ${profile.year}` : null]
    .filter(Boolean)
    .join(' · ');

  useEffect(() => {
    if (!user?.id) return undefined;
    let alive = true;
    setLoadingSug(true);
    api('/users?limit=4')
      .then((res) => {
        if (alive) setSuggestions(Array.isArray(res?.items) ? res.items : []);
      })
      .catch(() => {
        if (alive) setSuggestions([]);
      })
      .finally(() => {
        if (alive) setLoadingSug(false);
      });
    return () => { alive = false; };
  }, [user?.id]);

  const handleFollowChanged = (targetId, status) => {
    setSuggestions((cur) => cur.map((u) => (u.id === targetId ? {
      ...u,
      is_following: Boolean(status.is_following),
      is_followed_by: Boolean(status.is_followed_by),
      is_mutual: Boolean(status.is_mutual),
    } : u)));
  };

  return (
    <div className="d-flex flex-column gap-3">
      <Card className="soc-post-card soc-side-card overflow-hidden">
        <div className="soc-side-band" aria-hidden="true" />
        <Card.Body className="pt-0">
          <div className="soc-side-profile-top">
            <Link to={userId ? `/u/${userId}` : '/settings'} className="text-decoration-none">
              <Avatar src={profile?.avatar_url} name={displayName} size={56} className="soc-side-avatar" decorative />
            </Link>
          </div>
          <Link to={userId ? `/u/${userId}` : '/settings'} className="text-reset text-decoration-none">
            <div className="fw-bold text-truncate mt-2">{displayName}</div>
          </Link>
          {metaText ? (
            <div className="small text-body-secondary text-truncate">{metaText}</div>
          ) : (
            <Link to="/settings" className="small text-decoration-none">
              Bổ sung ngành &amp; trường →
            </Link>
          )}
          <div className="d-flex gap-2 mt-3">
            {userId && (
              <Button as={Link} to={`/u/${userId}`} variant="outline-primary" size="sm" className="flex-grow-1">
                Hồ sơ
              </Button>
            )}
            <Button as={Link} to="/search" variant="light" size="sm" className="flex-grow-1 border">
              Tìm bạn bè
            </Button>
          </div>
        </Card.Body>
      </Card>

      <Card body className="soc-post-card">
        <h2 className="h6 fw-bold mb-2">Khám phá nhanh</h2>
        <div className="soc-quick-grid">
          {CAMPUS_SHORTCUTS.map((item) => (
            <Link key={item.to} to={item.to} className="soc-quick-tile">
              <span className="soc-quick-icon" aria-hidden="true">
                <Icon name={item.icon} size={18} />
              </span>
              <span className="soc-quick-label">{item.label}</span>
            </Link>
          ))}
        </div>
      </Card>

      {(loadingSug || suggestions.length > 0) && (
        <Card body className="soc-post-card">
          <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
            <h2 className="h6 fw-bold mb-0">Gợi ý kết nối</h2>
            <Link to="/search" className="small fw-semibold text-decoration-none">
              Xem thêm
            </Link>
          </div>

          {loadingSug ? (
            <div className="d-flex flex-column gap-2" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="d-flex align-items-center gap-2 py-1">
                  <span className="ui-skeleton ui-skeleton-circle flex-shrink-0" style={{ width: 36, height: 36 }} />
                  <div className="flex-grow-1">
                    <span className="ui-skeleton mb-1" style={{ height: 12, width: '70%' }} />
                    <span className="ui-skeleton" style={{ height: 10, width: '48%' }} />
                  </div>
                  <span className="ui-skeleton flex-shrink-0" style={{ width: 68, height: 28 }} />
                </div>
              ))}
            </div>
          ) : (
            <div className="d-flex flex-column gap-2">
              {suggestions.map((u) => (
                <div key={u.id} className="soc-suggest-row">
                  <Link
                    to={`/u/${u.id}`}
                    className="text-reset text-decoration-none d-flex align-items-center gap-2 flex-grow-1"
                    style={{ minWidth: 0 }}
                  >
                    <Avatar src={u.avatar_url} name={u.full_name} size={36} decorative />
                    <div style={{ minWidth: 0 }}>
                      <div className="small fw-semibold text-truncate">{u.full_name}</div>
                      <div className="soc-suggest-reason text-truncate">{shortReason(u)}</div>
                    </div>
                  </Link>
                  <FollowButton
                    size="sm"
                    className="flex-shrink-0 soc-suggest-btn"
                    userId={u.id}
                    fullName={u.full_name}
                    isFollowing={u.is_following}
                    isFollowedBy={u.is_followed_by}
                    onChanged={(s) => handleFollowChanged(u.id, s)}
                    onToast={(t) => onToast?.(t.text, t.error ? 'delete' : 'edit', t.error ? 'alert' : 'check')}
                  />
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
