// Huy hiệu loại tệp (PDF, DOCX, …) có màu theo loại. Một nơi quyết định kích thước, dùng ở mọi chỗ trong module thư viện.
// size: 'md' (mặc định, theo CSS), 'sm' (40px), 'xs' (28px).
const SIZES = {
  md: undefined,
  sm: { width: 40, height: 40, borderRadius: 10, fontSize: '0.65rem' },
  xs: { width: 28, height: 28, borderRadius: 7, fontSize: '0.55rem' },
};

export default function FileBadge({ type = '', size = 'md', label }) {
  const t = type.toLowerCase();
  const cls = t === 'jpeg' ? 'jpg' : t; // .jpeg dùng chung màu với .jpg
  return (
    <span className={`lib-file-badge lib-file-${cls}`} style={SIZES[size]}
      {...(label ? { 'aria-label': label } : { 'aria-hidden': 'true' })}>
      {t.toUpperCase()}
    </span>
  );
}
