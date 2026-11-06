import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Copied from the PowerHER admin. Built into admin-ui/dist; deploy.sh publishes it at /admin/.
// In dev, API calls are proxied to a local `php -S 127.0.0.1:8099 -t quiz` (see README).
export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  build: { outDir: 'dist', emptyOutDir: true },
  server: { proxy: { '/api': 'http://127.0.0.1:8099' } },
});
