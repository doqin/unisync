// Hồ sơ người dùng /u/:id (FR-PRO-01, FR-PRO-03) – phụ trách: Khang.
// Nút Theo dõi / nhãn Mutual (FR-SOC-05) do issue #16 thêm vào khối đầu trang.
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Card, Container } from 'react-bootstrap';
import AsyncState from '../components/AsyncState.jsx';
import Avatar from '../components/Avatar.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ProfilePosts from '../components/ProfilePosts.jsx';
import { api } from '../lib/api.js';

const details = (p) => [p.major, p.school, p.year ? `Năm ${p.year}` : null].filter(Boolean);

export default function Profile() {
  const { id } = useParams();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    let alive = true;
    setProfile(null);
    setError(null);
    api(`/profiles/${id}`).then((p) => alive && setProfile(p)).catch((e) => alive && setError(e));
    return () => { alive = false; };
  }, [id]);
  useEffect(load, [load]);

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
            <Card body className="mb-4">
              <div className="d-flex flex-column flex-sm-row align-items-center align-items-sm-start gap-3">
                <Avatar src={profile.avatar_url} name={profile.full_name} size={112} />
                <div className="flex-grow-1 text-center text-sm-start">
                  <h1 className="h3 mb-1 text-break">{profile.full_name}</h1>
                  {details(profile).length > 0 && (
                    <p className="text-body-secondary mb-2">{details(profile).join(' · ')}</p>
                  )}
                  <p className="mb-2">
                    <strong>{profile.followers_count}</strong> người theo dõi · <strong>{profile.following_count}</strong> đang theo dõi
                  </p>
                  {profile.bio
                    ? <p className="mb-0 text-break" style={{ whiteSpace: 'pre-wrap' }}>{profile.bio}</p>
                    : profile.is_self && <p className="mb-0 text-body-secondary">Bạn chưa viết giới thiệu.</p>}
                </div>
                {profile.is_self && (
                  <Button as={Link} to="/settings" variant="outline-primary" size="sm" className="flex-shrink-0">
                    Chỉnh sửa hồ sơ
                  </Button>
                )}
              </div>
            </Card>
            <ProfilePosts userId={profile.id} isSelf={profile.is_self} />
          </>
        )}
      </AsyncState>
    </Container>
  );
}
