// Tài liệu xem gần đây của module thư viện: chỉ lưu phía trình duyệt (localStorage), không gửi lên máy chủ.
// Mọi thao tác bọc try/catch vì localStorage có thể bị chặn (cửa sổ riêng tư, xóa dữ liệu trang).
const KEY = 'lib-recent';
const MAX = 6;

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => x && x.id && x.title) : [];
  } catch {
    return [];
  }
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // bỏ qua: đây chỉ là tiện ích phụ
  }
}

export function getRecent() {
  return read();
}

/** Đưa tài liệu lên đầu danh sách, giữ tối đa MAX mục, không trùng. */
export function pushRecent(doc) {
  const item = { id: doc.id, title: doc.title, file_type: doc.file_type };
  write([item, ...read().filter((x) => x.id !== doc.id)].slice(0, MAX));
}

export function removeRecent(id) {
  write(read().filter((x) => x.id !== id));
}

/** Xóa toàn bộ danh sách xem gần đây. */
export function clearRecent() {
  write([]);
}
