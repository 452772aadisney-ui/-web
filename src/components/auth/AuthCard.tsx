import Link from 'next/link'
import type { ReactNode } from 'react'

interface AuthCardProps {
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
}

export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-8 text-center">
          <span className="text-4xl" aria-hidden="true">
            📚
          </span>
          <h1 className="mt-3 text-2xl font-bold">{title}</h1>
          <p className="mt-2 text-sm text-muted">{subtitle}</p>
        </div>

        {children}

        {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
      </div>
    </div>
  )
}

export function AuthLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-primary hover:underline">
      {children}
    </Link>
  )
}
