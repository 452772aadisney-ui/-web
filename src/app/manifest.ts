import type { MetadataRoute } from 'next'

/** Web App Manifest for 受験生web (student start URL). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '受験生web',
    short_name: '受験生web',
    description: '大学受験生向け学習管理アプリ',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    lang: 'ja',
    dir: 'ltr',
    background_color: '#f4f6fb',
    theme_color: '#2563eb',
    icons: [
      {
        src: '/icons/pwa/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/pwa/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/pwa/icon-maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/pwa/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
