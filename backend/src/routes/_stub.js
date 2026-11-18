import { Router } from 'express';

/** Router tạm: trả 501 cho tới khi module được cài đặt. */
export const stub = (name, reqs, owner) => {
  const r = Router();
  r.use((_req, res) =>
    res.status(501).json({ error: `Chưa cài đặt: ${name}`, requirements: reqs, owner }));
  return r;
};
