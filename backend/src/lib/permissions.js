// Quy tắc phân quyền (FR-AUTH-06). Thuần hàm, không đụng CSDL, để test được.
// Vai trò toàn hệ thống: profiles.role ('student' | 'moderator' | 'admin').
// Vai trò trong nhóm: group_members.role ('member' | 'manager') kèm status ('pending' | 'approved' | 'rejected').

export const isAdmin = (profile) => profile?.role === 'admin';

export const isApprovedMember = (membership) => membership?.status === 'approved';

export const isApprovedManager = (membership) =>
  isApprovedMember(membership) && membership.role === 'manager';

/** Duyệt thành viên, gán quản lý... : Admin hoặc quản lý nhóm đã được duyệt. */
export const canManageGroup = (profile, membership) => isAdmin(profile) || isApprovedManager(membership);

/** Xem/đăng nội dung riêng của nhóm: Admin hoặc thành viên đã được duyệt. */
export const canAccessGroup = (profile, membership) => isAdmin(profile) || isApprovedMember(membership);
