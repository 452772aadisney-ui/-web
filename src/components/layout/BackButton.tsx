import Link from 'next/link'
import { cn } from '@/lib/utils'

interface BackButtonProps {
  href: string
  label?: string
  className?: string
}

export function BackButton({ href, label = '戻る', className }: BackButtonProps) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex min-h-10 items-center gap-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-primary transition hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.98] active:bg-primary/10',
        className,
      )}
    >
      <span aria-hidden>←</span>
      {label}
    </Link>
  )
}
