import { defineConfig, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // RELATIVE base: an installed cartridge is served from
  // mnemo-plugin://app/<plugin-id>/…, and a root-absolute URL resolves outside
  // the plugin's prefix and 404s. Runtime fetches (the STEP worker, the Draco
  // decoder) go through assetUrl() for the same reason.
  base: './',
  plugins: [react()],
  server: {
    host: '127.0.0.1', // Electron does not reach ::1 here
    port: 5225,        // apps/dev-ports.json is the single source of truth
    strictPort: true,
    cors: true,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    // The vendored wasm files are copied as they are, never inlined.
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
} as UserConfig & { test: Record<string, unknown> });
