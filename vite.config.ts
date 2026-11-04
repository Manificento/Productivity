/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative base so the build works on any static host (Cloudflare Pages, Netlify, GitHub Pages subpath).
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'LifeOS',
        short_name: 'LifeOS',
        description: 'Персональный ассистент продуктивности с адаптацией режима',
        lang: 'ru',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#09090b',
        theme_color: '#4f46e5',
        // PNGs rendered from public/icons/icon.svg by scripts/generate-icons.mjs.
        icons: [
          { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/pwa-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Run in a non-UTC zone so bugs like toISOString().slice(0, 10) for local days fail in CI.
    env: { TZ: 'Asia/Almaty' },
    css: false,
    coverage: {
      provider: 'v8',
      // Coverage gates apply to the functional core: pure logic must be well tested (docs/adr/0004-testing-strategy.md).
      include: ['src/core/**/*.ts', 'src/modules/*/logic/**/*.ts'],
      exclude: ['**/*.test.ts', 'src/core/types.ts', 'src/core/adaptation/types.ts'],
      thresholds: { lines: 85, functions: 85, branches: 80, statements: 85 },
      reporter: ['text-summary', 'html'],
    },
  },
});
