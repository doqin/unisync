// Menu lọc tự thiết kế (thay thẻ <select> để giao diện đồng bộ với site). Dùng Dropdown của React-Bootstrap,
// nên vẫn điều khiển được bằng bàn phím (mũi tên, Enter, Esc) và có nhãn cho trình đọc màn hình.
import { Dropdown } from 'react-bootstrap';

export default function FilterDropdown({ id, label, value, options, onChange, className = '' }) {
  const current = options.find((o) => o.value === value) ?? options[0];
  return (
    <Dropdown className={`filter-dd ${className}`} onSelect={(key) => onChange(key ?? '')}>
      <Dropdown.Toggle id={id} variant="light" className="filter-dd-toggle" aria-label={`${label}: ${current.label}`}>
        <span className="text-truncate">{current.label}</span>
      </Dropdown.Toggle>
      <Dropdown.Menu className="filter-dd-menu">
        {options.map((o) => (
          <Dropdown.Item key={o.value || 'all'} eventKey={o.value} active={o.value === current.value}
            className="filter-dd-item">
            {o.label}
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
    </Dropdown>
  );
}
