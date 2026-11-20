import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';

const app = express();

app.set('trust proxy', 1); // sau proxy của Vercel
app.use(helmet());
// CORS: origin của frontend cấu hình (FRONTEND_URL) hoặc cùng host với API (một dự án Vercel,
// frontend và /api cùng domain; domain của bản preview thay đổi theo nhánh).
app.use(cors((req, cb) => {
  const origin = req.headers.origin;
  if (!origin) return cb(null, { origin: false, credentials: true });
  const sameHost = origin === `https://${req.headers.host}` || origin === `http://${req.headers.host}`;
  return cb(null, { origin: sameHost || origin === env.FRONTEND_URL, credentials: true });
}));

app.use(express.json({ limit: '100kb' })); // tệp không đi qua Express (giới hạn body 4,5 MB của Vercel)

app.use('/api', routes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
