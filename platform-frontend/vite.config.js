import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // In dev, proxy auth requests to the auth server.
      '/auth': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      // Backward-compatible path for older built assets.
      '/api/auth': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      // In dev, proxy platform API requests to the platform API server.
      '/api': {
        target: 'http://localhost:8090',
        changeOrigin: true,
      },
    },
  },
});
