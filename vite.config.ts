import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Relative base so the built app works both as a hosted PWA and when bundled
// inside a Capacitor Android/iOS webview.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'],
      manifest: {
        name: 'AMBGro',
        short_name: 'AMBGro',
        description:
          'Digital WHO/CDC growth charts with exact LMS Z-scores and centiles. Works offline.',
        theme_color: '#2563eb',
        background_color: '#f6f7fb',
        display: 'standalone',
        orientation: 'any',
        start_url: '.',
        icons: [
          // PNGs first so Android's install prompt / launcher / splash have a raster source.
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
});
