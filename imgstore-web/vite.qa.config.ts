import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Read-only local acceptance workflow. Never use this config for publishing.
export default defineConfig(({ command }) => {
  if (command !== 'serve') throw new Error('The QA fixture is serve-only; use the normal production build.');
  return {
    plugins: [react()],
    server: { host: '127.0.0.1', port: 5193, strictPort: true },
  };
});
