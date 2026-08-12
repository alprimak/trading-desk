import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    // Shims browser APIs jsdom omits (window.matchMedia) — see src/test-setup.ts
    setupFiles: ['./src/test-setup.ts'],
  },
});
