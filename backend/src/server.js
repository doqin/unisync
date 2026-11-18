// Chạy cục bộ. Trên Vercel dùng api/index.js.
import app from './app.js';
import { env } from './config/env.js';

app.listen(env.PORT, () => console.log(`UniSync API: http://localhost:${env.PORT}/api`));
