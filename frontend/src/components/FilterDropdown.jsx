// Menu lọc tự thiết kế (thay thẻ <select> để giao diện đồng bộ với site). Dùng Dropdown của React-Bootstrap,
// nên vẫn điều khiển được bằng bàn phím (mũi tên, Enter, Esc) và có nhãn cho trình đọc màn hình.
// Danh sách dài (trên SEARCH_THRESHOLD mục, ví dụ môn học) tự có ô gõ để lọc nhanh, không phân biệt dấu tiếng Việt.
import { useEffect, useRef, useState } from 'react';
import { Dropdown } from 'react-bootstrap';

const SEARCH_THRESHOLD = 8;

const norm = (t) => (t ?? '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'D')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase();

export default function FilterDropdown({ id, label, value, options, onChange, className = '' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  const menuRef = useRef(null);

  const current = options.find((o) => o.value === value) ?? options[0];
  const searchable = options.length > SEARCH_THRESHOLD;
  const q = norm(query.trim());
  const shown = searchable && q ? options.filter((o) => norm(o.label).includes(q)) : options;

  // Mở menu thì đưa con trỏ vào ô lọc để gõ ngay.
  useEffect(() => {
    if (!open || !searchable) return undefined;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open, searchable]);

  function onSearchKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      menuRef.current?.querySelector('.dropdown-item')?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault(); // không gửi form tìm kiếm của trang
      menuRef.current?.querySelector('.dropdown-item')?.click(); // chọn kết quả đầu tiên
    }
  }

  return (
    <Dropdown
      className={`lib-filter-dd ${className}`}
      onSelect={(key) => onChange(key ?? '')}
      onToggle={(next) => { setOpen(next); if (!next) setQuery(''); }}
    >
      <Dropdown.Toggle id={id} variant="light" className="lib-filter-dd-toggle" aria-label={`${label}: ${current.label}`}>
        <span className="text-truncate">{current.label}</span>
      </Dropdown.Toggle>
      <Dropdown.Menu className="lib-filter-dd-menu" ref={menuRef}>
        {searchable && (
          <div className="lib-filter-dd-search">
            <input ref={inputRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKeyDown} placeholder="Tìm trong danh sách…" aria-label={`Tìm trong danh sách: ${label}`}
              autoComplete="off" />
          </div>
        )}
        <div className="lib-filter-dd-list">
          {shown.map((o) => (
            <Dropdown.Item key={o.value || 'all'} eventKey={o.value} active={o.value === current.value}
              className="lib-filter-dd-item">
              {o.label}
            </Dropdown.Item>
          ))}
          {shown.length === 0 && <div className="small text-muted px-3 py-2">Không có kết quả</div>}
        </div>
      </Dropdown.Menu>
    </Dropdown>
  );
}
