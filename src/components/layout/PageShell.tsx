import Link from 'next/link'
import type { ReactNode } from 'react'
import { signOut } from '@/app/auth/actions'

interface PageHeaderProps {
  title: string
  backHref?: string
  backLabel?: string
}

export function PageHeader({ title, backHref, backLabel }: PageHeaderProps) {
  return (
    <header className="border-b border-border bg-card px-4 py-4">
      <div className="mx-auto flex max-w-3xl items-center justify-between">
        <div>
          {backHref && (
            <Link href={backHref} className="text-sm text-primary hover:underline">
              ← {backLabel ?? '戻る'}
            </Link>
          )}
          <p className="text-sm text-muted">受験生web</p>
          <h1 className="text-xl font-bold">{title}</h1>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-background"
          >
            ログアウト
          </button>
        </form>
      </div>
    </header>
  )
}

export function PageShell({
  title,
  backHref,
  backLabel,
  children,
}: PageHeaderProps & { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <PageHeader title={title} backHref={backHref} backLabel={backLabel} />
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  )
}
