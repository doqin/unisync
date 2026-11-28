// Bộ biểu tượng vẽ tay dùng chung (nét 2px, bo tròn, 24×24, cùng kiểu với sơ đồ ở trang giới thiệu).
// Biểu tượng chỉ để trang trí: tên truy cập do chữ đi kèm (hoặc nhãn ẩn) đảm nhiệm.
const PATHS = {
  home: <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></>,
  groups: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  library: <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></>,
  // Đồng hồ bấm giờ (Pomodoro): có nút trên đỉnh, khác với đồng hồ "lịch sử" và chuông.
  study: <><circle cx="12" cy="14" r="8" /><path d="M12 10v4l2.5 2.5" /><path d="M9.5 2h5" /><path d="M12 2v4" /></>,
  // Mảnh ghép: ghép đội, không giống biểu tượng người (nhóm, tài khoản).
  teamup: <path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.23 8.77c.24-.24.581-.353.917-.303.515.077.877.528 1.073 1.01a2.5 2.5 0 1 0 3.259-3.259c-.482-.196-.933-.558-1.01-1.073-.05-.336.062-.676.303-.917l1.525-1.525A2.402 2.402 0 0 1 12 1.998c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02Z" />,
  search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></>,
  bell: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
  arrowUp: <><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></>,
  user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  // Thành công / lỗi (toast, thông báo) và nút đóng / xoá.
  check: <><circle cx="12" cy="12" r="10" /><path d="m8 12 3 3 5-6" /></>,
  alert: <><circle cx="12" cy="12" r="10" /><path d="M12 7v6" /><path d="M12 17h.01" /></>,
  close: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
};

/** @param {{ name: keyof typeof PATHS, size?: number, className?: string }} props */
export default function Icon({ name, size = 22, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={`flex-shrink-0 ${className}`.trim()}>
      {PATHS[name]}
    </svg>
  );
}
