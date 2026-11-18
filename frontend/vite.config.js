import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Khi chạy `npm run dev` riêng lẻ, chuyển /api sang Express cục bộ (khớp rewrite của Vercel).
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
