import type { Metadata } from 'next'
import { Noto_Sans_JP } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'

const notoSansJp = Noto_Sans_JP({
  subsets: ['latin'],
  variable: '--font-noto-sans-jp',
})

export const metadata: Metadata = {
  title: '受験生web',
  description: '大学受験生向け学習管理アプリ',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
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
        <Toaster
          position="top-right"
          richColors
          closeButton
          duration={3000}
          offset={{ top: '8rem', right: '1rem' }}
          mobileOffset={{ top: '8rem', right: '0.75rem', left: '0.75rem' }}
          containerAriaLabel="通知"
          toastOptions={{
            classNames: {
              toast: 'max-w-[min(24rem,calc(100vw-1.5rem))]',
            },
          }}
        />
      </body>
    </html>
  )
}
