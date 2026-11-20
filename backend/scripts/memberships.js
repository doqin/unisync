// Seed thành viên nhóm học phần (dữ liệu demo cho FR-DOC-01/02 và FR-GRP-02/03).
// Tách khỏi seed.js để test không cần CSDL: hàm thuần nhận profiles + groups đã có trong CSDL.
//
// Vì sao cần: `POST /api/documents/upload-url` chỉ cho thành viên ĐÃ DUYỆT của nhóm học phần
// đăng tài liệu (backend/src/routes/documents.js). Chưa có UI nhóm và chưa có thành viên nào
// trong CSDL thì trang /library/new luôn trống. Seed này tạo sẵn vài membership đã duyệt để
// cả nhóm nghiệm thu được thư viện tài liệu ngay.

/** Học phần mặc định cho mỗi hồ sơ (các môn nhóm đang dùng trong học kỳ này). */
export const DEFAULT_MEMBERSHIP_CODES = ['SE347', 'SE358', 'IT001', 'IT002', 'IT003'];

/**
 * Lập danh sách membership cần upsert: mỗi hồ sơ × mỗi nhóm học phần được chọn.
 * Admin hệ thống vào nhóm với vai trò `manager` để duyệt được yêu cầu tham gia (FR-GRP-03).
 *
 * @param {object} opts
 * @param {{ id: string, role?: string }[]} opts.profiles hồ sơ hiện có
 * @param {{ id: string, type: string, code: string | null }[]} opts.groups nhóm hiện có
 * @param {string[]} [opts.codes] mã học phần cần seed
 * @returns {{ rows: object[], groups: object[], missing: string[] }}
 */
export function planMemberships({ profiles = [], groups = [], codes = DEFAULT_MEMBERSHIP_CODES }) {
  const courseByCode = new Map(
    groups.filter((g) => g.type === 'course' && g.code).map((g) => [g.code, g]),
  );
  const chosen = codes.map((code) => courseByCode.get(code)).filter(Boolean);
  const missing = codes.filter((code) => !courseByCode.has(code));

  const rows = [];
  for (const profile of profiles) {
    for (const group of chosen) {
      rows.push({
        group_id: group.id,
        user_id: profile.id,
        status: 'approved',
        role: profile.role === 'admin' ? 'manager' : 'member',
      });
    }
  }
  return { rows, groups: chosen, missing };
}
