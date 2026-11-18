import { HttpError } from '../lib/errors.js';

export const notFoundHandler = (_req, res) => res.status(404).json({ error: 'Không tìm thấy đường dẫn' });

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
  console.error(err);
  res.status(500).json({ error: 'Lỗi máy chủ' });
};
