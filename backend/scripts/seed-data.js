// Dữ liệu seed nhóm ngành / học phần của UIT (FR-GRP-07). Tách khỏi seed.js để test không cần CSDL.
// Học phần: danh mục môn học còn mở lớp (daa.uit.edu.vn/danh-muc-mon-hoc-dai-hoc), bỏ khóa luận / thực tập / đồ án tốt nghiệp.
import { readFileSync } from 'node:fs';

export const majors = [
  { code: 'MAJ-CS', name: 'Khoa học máy tính' },
  { code: 'MAJ-SE', name: 'Kỹ thuật phần mềm' },
  { code: 'MAJ-IS', name: 'Hệ thống thông tin' },
  { code: 'MAJ-IT', name: 'Công nghệ thông tin' },
  { code: 'MAJ-CE', name: 'Kỹ thuật máy tính' },
  { code: 'MAJ-NT', name: 'Mạng máy tính và truyền thông dữ liệu' },
  { code: 'MAJ-AT', name: 'An toàn thông tin' },
  { code: 'MAJ-EC', name: 'Thương mại điện tử' },
  { code: 'MAJ-DS', name: 'Khoa học dữ liệu' },
  { code: 'MAJ-AI', name: 'Trí tuệ nhân tạo' },
  { code: 'MAJ-VM', name: 'Thiết kế vi mạch' },
  { code: 'MAJ-MM', name: 'Truyền thông đa phương tiện' },
];

const courses = JSON.parse(readFileSync(new URL('./data/uit-courses.json', import.meta.url), 'utf8'));

export const buildGroups = () => [
  ...majors.map((m) => ({ type: 'major', ...m, description: `Nhóm ngành ${m.name}` })),
  ...courses.map((c) => ({
    type: 'course',
    code: c.code,
    name: c.name,
    description: `Nhóm học phần ${c.code}${c.en ? ` – ${c.en}` : ''} (${c.credits} tín chỉ, đơn vị ${c.unit})`,
  })),
];
