import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // Keys activate on the backend immediately. Saving them must not reload the
    // browser and discard the settings dialog or an active voice conversation.
    watch: {
      ignored: ['**/.env', '**/.env.*', '**/.local/**', '**/artifacts/**', '**/dist-server/**'],
    },
    proxy: { '/api': 'http://127.0.0.1:4311', '/health': 'http://127.0.0.1:4311' },
  },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
} as Parameters<typeof defineConfig>[0]);
