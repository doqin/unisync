// Ảnh đại diện tròn; chưa có ảnh thì hiện chữ cái đầu của tên. Dùng ở hồ sơ, cài đặt và danh sách người dùng.
export default function Avatar({ src, name, size = 96, className = '' }) {
  const style = { width: size, height: size, fontSize: size * 0.4 };
  if (src) {
    return (
      <img src={src} alt={`Ảnh đại diện của ${name || 'người dùng'}`} width={size} height={size}
        className={`rounded-circle object-fit-cover flex-shrink-0 ${className}`.trim()} style={style} />
    );
  }
  const initial = (name ?? '').trim().split(/\s+/).pop()?.[0]?.toUpperCase() || '?';
  return (
    <span role="img" aria-label={`Ảnh đại diện của ${name || 'người dùng'}`}
      className={`rounded-circle bg-primary-subtle text-primary-emphasis fw-semibold d-inline-flex align-items-center justify-content-center flex-shrink-0 ${className}`.trim()}
      style={style}>
      {initial}
    </span>
  );
}
