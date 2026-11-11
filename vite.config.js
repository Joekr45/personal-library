import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    // During development, send /api requests to the local server (npm run dev:server, port 3001)
    proxy: {
      '/api': 'http://localhost:3001'
    }
  }
});
