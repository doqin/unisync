import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';

const app = express();

app.set('trust proxy', 1); // sau proxy của Vercel
app.use(helmet());
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || origin === env.FRONTEND_URL),
  credentials: true,
}));
app.use(express.json({ limit: '100kb' })); // tệp không đi qua Express (giới hạn body 4,5 MB của Vercel)

app.use('/api', routes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
