// Bộ chọn 6 cảm xúc cho bài đăng và bình luận (hover/click) — phụ trách: Đức Huy (dhuyy-06).
import { useEffect, useRef, useState } from 'react';

export const REACTIONS = [
  { type: 'like', emoji: '👍', label: 'Thích', colorClass: 'is-like', barColor: '#3b82f6' },
  { type: 'love', emoji: '❤️', label: 'Yêu thích', colorClass: 'is-love', barColor: '#f43f5e' },
  { type: 'haha', emoji: '😂', label: 'Haha', colorClass: 'is-haha', barColor: '#f59e0b' },
  { type: 'wow', emoji: '😮', label: 'Wow', colorClass: 'is-wow', barColor: '#eab308' },
  { type: 'sad', emoji: '😢', label: 'Buồn', colorClass: 'is-sad', barColor: '#06b6d4' },
  { type: 'angry', emoji: '😡', label: 'Phẫn nộ', colorClass: 'is-angry', barColor: '#ef4444' },
];

export const REACTION_MAP = Object.fromEntries(REACTIONS.map((r) => [r.type, r]));

/** Sắp xếp các loại cảm xúc có số lượng > 0 theo thứ tự phổ biến giảm dần. */
export function sortedReactionEntries(reactionCounts = {}) {
  return Object.entries(reactionCounts ?? {})
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => (REACTION_MAP[type] ? { ...REACTION_MAP[type], count } : null))
    .filter(Boolean);
}

/** Lấy tối đa 3 emoji phổ biến nhất để hiện tóm tắt. */
export function topReactionEmojis(reactionCounts = {}) {
  return sortedReactionEntries(reactionCounts).slice(0, 3).map((r) => r.emoji);
}

/**
 * Nút chọn 6 cảm xúc kèm thanh nổi khi rê chuột / mở.
 * - `variant="comment"`: icon nhỏ gọn ở bình luận.
 * - `variant="post"`: nút hành động của bài đăng (bấm nhanh thả `'love'`, hover chọn 6 cảm xúc).
 */
export default function ReactionPicker({
  variant = 'comment',
  myReaction,
  busy = false,
  isOpen: controlledOpen,
  onOpen,
  onClose,
  onToggleOpen,
  onSelect,
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const closeTimerRef = useRef(null);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;

  useEffect(() => () => clearTimeout(closeTimerRef.current), []);

  const openTray = () => {
    clearTimeout(closeTimerRef.current);
    if (isControlled) onOpen?.();
    else setInternalOpen(true);
  };

  const closeTray = () => {
    clearTimeout(closeTimerRef.current);
    if (isControlled) onClose?.();
    else setInternalOpen(false);
  };

  const scheduleClose = () => {
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(closeTray, 120);
  };

  const handleMainClick = () => {
    if (variant === 'post') {
      closeTray();
      onSelect(myReaction ? null : 'love');
      return;
    }
    if (myReaction) {
      closeTray();
      onSelect(null);
    } else if (isControlled) {
      onToggleOpen?.();
    } else {
      setInternalOpen((v) => !v);
    }
  };

  const active = myReaction ? REACTION_MAP[myReaction] : null;
  const isPost = variant === 'post';

  return (
    <div
      className={`soc-react-wrap${isOpen ? ' is-open' : ''}`}
      onMouseEnter={openTray}
      onMouseLeave={scheduleClose}
    >
      {isOpen && (
        <div className="soc-react-tray-bridge">
          <div className="soc-react-tray" role="group" aria-label={isPost ? 'Chọn cảm xúc cho bài đăng' : 'Chọn cảm xúc cho bình luận'}>
            {REACTIONS.map((r) => (
              <button
                key={r.type}
                type="button"
                className={`soc-react-choice${myReaction === r.type ? ' is-selected' : ''}`}
                onClick={() => {
                  closeTray();
                  onSelect(r.type);
                }}
                aria-label={r.label}
                title={r.label}
              >
                {r.emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {isPost ? (
        <button
          type="button"
          className={`soc-action-btn soc-post-react-btn${active ? ` is-reacted ${active.colorClass}` : ''}`}
          disabled={busy}
          aria-pressed={Boolean(active)}
          aria-expanded={isOpen}
          aria-label={active ? `Đã thả ${active.label} (bấm để bỏ)` : 'Thích bài đăng'}
          title={active ? `${active.label} (bấm để bỏ)` : 'Thích'}
          onClick={handleMainClick}
        >
          {active ? (
            <>
              <span className="soc-react-active-emoji" aria-hidden="true">{active.emoji}</span>
              <span>{active.label}</span>
            </>
          ) : (
            <>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
                className="soc-action-heart"
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              <span>Thích</span>
            </>
          )}
        </button>
      ) : (
        <button
          type="button"
          className={`soc-react-icon-btn${active ? ` is-reacted ${active.colorClass}` : ''}`}
          disabled={busy}
          aria-label={active ? `Đã thả ${active.label} (bấm để bỏ)` : 'Thả cảm xúc cho bình luận'}
          aria-expanded={isOpen}
          title={active ? `${active.label} (bấm để bỏ)` : 'Thả cảm xúc'}
          onClick={handleMainClick}
        >
          {active ? (
            <span className="soc-react-active-emoji" aria-hidden="true">{active.emoji}</span>
          ) : (
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}
