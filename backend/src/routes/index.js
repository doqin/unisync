import { Router } from 'express';
import health from './health.js';
import auth from './auth.js';
import documents from './documents.js';
import groups from './groups.js';
import profiles from './profiles.js';
import posts from './posts.js';
import feed from './feed.js';
import follows from './follows.js';
import users from './users.js';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { signAvatar } from '../lib/avatar.js';
import { stub } from './_stub.js';

const r = Router();

// Công khai
r.use('/health', health);
r.use('/auth', auth);

// Từ đây trở xuống mọi API đều cần JWT hợp lệ (NFR-03)
r.use(requireAuth);

r.get('/me', async (req, res, next) => {
  try {
    res.json({ id: req.user.id, email: req.user.email, profile: await signAvatar(supabaseAdmin(), req.profile) });
  } catch (e) {
    next(e);
  }
});

// Mỗi module do một thành viên phụ trách (SRS 12.2). Thay stub bằng router thật.
r.use('/profiles',      profiles);
r.use('/posts',         posts);
r.use('/feed',          feed);
r.use('/follows',       follows);
r.use('/users',         users);
r.use('/notifications', stub('Thông báo',        'FR-SOC-07',      'Đức Huy'));
r.use('/groups',        groups);
r.use('/teamups',       stub('Team-up',          'FR-TEAM-01..09', 'Hướng'));
r.use('/documents',     documents);
r.use('/study',         stub('Góc học tập',      'FR-STU-04..09',  'Minh Trọng'));
r.use('/admin',         stub('Quản trị',         'FR-ADM-01..04',  'Khang'));

export default r;
