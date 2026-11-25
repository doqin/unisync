// Đánh giá sao (FR-DOC-08). Có onChange: cho bấm chọn 1–5 sao. Không có: chỉ hiển thị điểm.
import { useState } from 'react';

export default function StarRating({ value = 0, onChange, disabled = false, label = 'Đánh giá' }) {
  const [hover, setHover] = useState(0);

  if (!onChange) {
    const pct = (Math.max(0, Math.min(5, value)) / 5) * 100;
    return (
      <span className="lib-stars-readonly" role="img" aria-label={`${value} trên 5 sao`}>
        <span className="lib-stars-track" aria-hidden="true">★★★★★</span>
        <span className="lib-stars-fill" aria-hidden="true" style={{ width: `${pct}%` }}>★★★★★</span>
      </span>
    );
  }

  // Đang rê (hoặc focus): tô nhạt tới sao đang rê để xem trước; còn lại: tô đậm theo điểm đã chọn.
  const starClass = (n) => {
    if (hover) return n <= hover ? 'preview' : '';
    return n <= value ? 'on' : '';
  };
  return (
    <div className="d-inline-flex align-items-center" role="group" aria-label={label}
      onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={disabled}
          className={`lib-star-btn ${starClass(n)}`}
          onMouseEnter={() => setHover(n)} onFocus={() => setHover(n)} onBlur={() => setHover(0)}
          onClick={() => onChange(n)} aria-label={`${n} sao`} aria-pressed={value === n}>
          ★
        </button>
      ))}
    </div>
  );
}
