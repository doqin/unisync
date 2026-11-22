// Trang cài đặt – phụ trách: Khang. Mỗi mục là một component riêng để các issue sau thêm mục mà không đụng nhau:
// đổi mật khẩu (FR-AUTH-05, #19), cài đặt Pomodoro (FR-STU-02, Minh Trọng).
import { useCallback, useEffect, useState } from 'react';
import { Container } from 'react-bootstrap';
import AsyncState from '../components/AsyncState.jsx';
import ProfileSettings from '../components/ProfileSettings.jsx';
import { api } from '../lib/api.js';

export default function Settings() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    api('/me').then((me) => setProfile(me.profile)).catch(setError);
  }, []);
  useEffect(load, [load]);

  return (
    <Container className="py-4" style={{ maxWidth: 720 }}>
      <h1 className="h3 mb-4">Cài đặt</h1>
      <AsyncState loading={!profile && !error} error={error} onRetry={load} errorTitle="Không tải được hồ sơ">
        {profile && <ProfileSettings profile={profile} onChange={setProfile} />}
      </AsyncState>
    </Container>
  );
}
