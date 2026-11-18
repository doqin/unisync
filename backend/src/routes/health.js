import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';

const r = Router();

// Vercel Cron gọi hằng ngày để Supabase không bị tạm dừng (SRS 6.1): phải có truy vấn CSDL.
r.get('/', async (_req, res) => {
  try {
    const { error } = await supabaseAdmin().from('groups').select('id', { head: true, count: 'exact' }).limit(1);
    if (error) throw error;
    res.json({ ok: true, db: 'up', time: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ ok: false, db: 'down', error: e.message });
  }
});

export default r;
