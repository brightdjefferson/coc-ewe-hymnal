import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Ask before switching to a new version of the app (see UpdatePrompt).
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'COC Ewe Hymnal',
        short_name: 'Ewe Hymnal',
        description: 'A free, offline hymnal in Ewe and English for Churches of Christ.',
        lang: 'ee',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f3f5f8',
        theme_color: '#14213d',
        categories: ['books', 'education', 'music'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app's own files are kept on the phone. Hymns are stored
        // separately (IndexedDB), so database calls are never cached here.
        globPatterns: ['**/*.{js,css,html,woff2,svg,png}'],
        // Word/PDF readers are only for the admin upload page: not kept offline.
        globIgnores: ['**/mammoth*', '**/pdf-*', '**/pdf.worker*', '**/pdfLines*', 'templates/**'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
    }),
  ],
})
