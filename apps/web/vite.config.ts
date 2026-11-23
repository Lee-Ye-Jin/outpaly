import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // 개발 중에는 /api 를 Express 로 넘겨 같은 출처로 쓴다 (쿠키 인증을 단순하게)
    proxy: {
      '/api': 'http://localhost:4000'
    }
  }
});
