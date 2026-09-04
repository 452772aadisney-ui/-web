import type { Metadata } from 'next'
import { Noto_Sans_JP } from 'next/font/google'
import { AppToaster } from '@/components/toast/AppToaster'
import './globals.css'

const notoSansJp = Noto_Sans_JP({
  subsets: ['latin'],
  variable: '--font-noto-sans-jp',
})

export const metadata: Metadata = {
  title: '受験生web',
  description: '大学受験生向け学習管理アプリ',
  applicationName: '受験生web',
  appleWebApp: {
    capable: true,
    title: '受験生web',
    statusBarStyle: 'default',
  },
  icons: {
    apple: [{ url: '/icons/pwa/apple-touch-icon.png', sizes: '180x180' }],
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#2563eb',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja">
      <body className={`${notoSansJp.variable} font-sans antialiased`}>
        {children}
        <AppToaster />
      </body>
    </html>
  )
}
