// Bộ chọn 6 cảm xúc cho bình luận (hover/click) — phụ trách: Đức Huy (dhuyy-06).

export const REACTIONS = [
  { type: 'like', emoji: '👍', label: 'Thích', colorClass: 'is-like' },
  { type: 'love', emoji: '❤️', label: 'Yêu thích', colorClass: 'is-love' },
  { type: 'haha', emoji: '😂', label: 'Haha', colorClass: 'is-haha' },
  { type: 'wow', emoji: '😮', label: 'Wow', colorClass: 'is-wow' },
  { type: 'sad', emoji: '😢', label: 'Buồn', colorClass: 'is-sad' },
  { type: 'angry', emoji: '😡', label: 'Phẫn nộ', colorClass: 'is-angry' },
];

export const REACTION_MAP = Object.fromEntries(REACTIONS.map((r) => [r.type, r]));

/** Lấy tối đa 3 emoji phổ biến nhất của bình luận để hiện badge tổng hợp. */
export function topReactionEmojis(reactionCounts = {}) {
  return Object.entries(reactionCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type]) => REACTION_MAP[type]?.emoji)
    .filter(Boolean);
}

/**
 * Nút chọn cảm xúc dạng icon nhỏ gọn kèm thanh nổi 6 cảm xúc khi hover/mở.
 * @param {object} props
 * @param {string | null} [props.myReaction]
 * @param {boolean} [props.busy]
 * @param {boolean} [props.isOpen]
 * @param {() => void} [props.onOpen]
 * @param {() => void} [props.onClose]
 * @param {() => void} [props.onToggleOpen]
 * @param {(reactionType: string | null) => void} props.onSelect
 */
export default function ReactionPicker({
  myReaction,
  busy = false,
  isOpen = false,
  onOpen,
  onClose,
  onToggleOpen,
  onSelect,
}) {
  const active = myReaction ? REACTION_MAP[myReaction] : null;

  return (
    <div
      className={`soc-react-wrap${isOpen ? ' is-open' : ''}`}
      onMouseEnter={onOpen}
      onMouseLeave={onClose}
    >
      {isOpen && (
        <div className="soc-react-tray-bridge">
          <div className="soc-react-tray" role="group" aria-label="Chọn cảm xúc cho bình luận">
            {REACTIONS.map((r) => (
              <button
                key={r.type}
                type="button"
                className={`soc-react-choice${myReaction === r.type ? ' is-selected' : ''}`}
                onClick={() => onSelect(r.type)}
                aria-label={r.label}
                title={r.label}
              >
                {r.emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        className={`soc-react-icon-btn${active ? ` is-reacted ${active.colorClass}` : ''}`}
        disabled={busy}
        aria-label={active ? `Đã thả ${active.label} (bấm để bỏ)` : 'Thả cảm xúc cho bình luận'}
        aria-expanded={isOpen}
        title={active ? `${active.label} (bấm để bỏ)` : 'Thả cảm xúc'}
        onClick={() => (active ? onSelect(null) : onToggleOpen?.())}
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
    </div>
  );
}
