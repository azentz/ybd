import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/ybd/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'YBD - Yo Big Dawg',
        short_name: 'YBD',
        description: 'Peer-to-peer web darts game',
        start_url: '/ybd/',
        scope: '/ybd/',
        display: 'standalone',
        background_color: '#f2f1e9',
        theme_color: '#b14f12',
        icons: [
          {
            src: '/ybd/pwa-icon.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
          {
            src: '/ybd/pwa-icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/ybd/offline.html',
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
})
