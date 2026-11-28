// Nút Theo dõi / Bỏ theo dõi và nhãn Mutual (FR-SOC-05) – phụ trách: Đức Huy (dhuyy-06).
import { useEffect, useState } from 'react';
import { Badge, Button } from 'react-bootstrap';
import { api } from '../lib/api.js';
import { errorMessage } from '../lib/errors.js';

/** Nhãn hiển thị khi hai người dùng theo dõi lẫn nhau. */
export function MutualBadge({ className = 'align-middle' }) {
  return (
    <Badge bg="success-subtle" text="success-emphasis" className={className} title="Hai bạn đang theo dõi nhau">
      Mutual
    </Badge>
  );
}

/**
 * Nút theo dõi / bỏ theo dõi một người dùng qua API `/api/follows/:userId`.
 * @param {{
 *   userId: string,
 *   fullName?: string,
 *   isFollowing?: boolean,
 *   isFollowedBy?: boolean,
 *   size?: 'sm' | 'lg',
 *   className?: string,
 *   onChanged?: (status: object) => void,
 *   onToast?: (toast: { text: string, error?: boolean }) => void,
 * }} props
 */
export default function FollowButton({
  userId,
  fullName = 'người dùng này',
  isFollowing = false,
  isFollowedBy = false,
  size,
  className = '',
  onChanged,
  onToast,
}) {
  const [busy, setBusy] = useState(false);
  const [hot, setHot] = useState(false); // đang rê chuột / focus vào nút
  const [justFollowed, setJustFollowed] = useState(false); // vừa bấm theo dõi: chưa đổi sang "Bỏ theo dõi" ngay

  useEffect(() => {
    setHot(false);
    setJustFollowed(false);
  }, [userId, isFollowing]);

  async function toggleFollow() {
    const unfollow = Boolean(isFollowing);
    setBusy(true);
    try {
      const status = await api(`/follows/${userId}`, { method: unfollow ? 'DELETE' : 'POST' });
      setJustFollowed(!unfollow);
      onChanged?.(status);
      onToast?.({ text: `${unfollow ? 'Đã bỏ theo dõi' : 'Đã theo dõi'} ${fullName}` });
    } catch (e) {
      onToast?.({ text: errorMessage(e), error: true });
    } finally {
      setBusy(false);
    }
  }

  const enter = () => setHot(true);
  const leave = () => {
    setHot(false);
    setJustFollowed(false);
  };

  // Đang theo dõi + rê chuột/focus → báo trước hành động "Bỏ theo dõi" (đỏ) để tránh bấm nhầm.
  const warnUnfollow = Boolean(isFollowing) && hot && !justFollowed;
  const label = warnUnfollow
    ? 'Bỏ theo dõi'
    : isFollowing
      ? 'Đang theo dõi'
      : isFollowedBy
        ? 'Theo dõi lại'
        : 'Theo dõi';
  const variant = warnUnfollow ? 'outline-danger' : isFollowing ? 'outline-secondary' : 'primary';

  return (
    <Button
      size={size}
      variant={variant}
      className={className}
      onClick={toggleFollow}
      disabled={busy}
      aria-busy={busy}
      onMouseEnter={enter}
      onMouseLeave={leave}
      onFocus={enter}
      onBlur={leave}
      aria-label={`${isFollowing ? 'Bỏ theo dõi' : 'Theo dõi'} ${fullName}`}
    >
      {label}
    </Button>
  );
}
