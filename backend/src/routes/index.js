import { Router } from 'express';
import health from './health.js';
import auth from './auth.js';
import documents from './documents.js';
import { requireAuth } from '../middleware/auth.js';
import { stub } from './_stub.js';

const r = Router();

// Công khai
r.use('/health', health);
r.use('/auth', auth);

// Từ đây trở xuống mọi API đều cần JWT hợp lệ (NFR-03)
r.use(requireAuth);

r.get('/me', (req, res) => res.json({ id: req.user.id, email: req.user.email, profile: req.profile }));

// Mỗi module do một thành viên phụ trách (SRS 12.2). Thay stub bằng router thật.
r.use('/profiles',      stub('Hồ sơ',            'FR-PRO-01..04',  'Khang'));
r.use('/posts',         stub('Bài đăng',         'FR-SOC-01..04',  'Đức Huy'));
r.use('/feed',          stub('Bảng tin',         'FR-SOC-02',      'Đức Huy'));
r.use('/follows',       stub('Theo dõi',         'FR-SOC-05',      'Đức Huy'));
r.use('/users',         stub('Tìm người dùng',   'FR-SOC-06',      'Minh Trọng'));
r.use('/notifications', stub('Thông báo',        'FR-SOC-07',      'Đức Huy'));
r.use('/groups',        stub('Nhóm',             'FR-GRP-01..06',  'Hướng'));
r.use('/teamups',       stub('Team-up',          'FR-TEAM-01..09', 'Hướng'));
r.use('/documents',     documents);
r.use('/study',         stub('Góc học tập',      'FR-STU-04..09',  'Minh Trọng'));
r.use('/admin',         stub('Quản trị',         'FR-ADM-01..04',  'Khang'));

export default r;
