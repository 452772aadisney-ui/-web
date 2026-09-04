import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
  ADMIN_COMFORTABLE_CONTENT_CLASS,
  ADMIN_NARROW_CONTENT_CLASS,
} from '@/components/layout/admin-layout'

type AdminNarrowContentProps = {
  children: ReactNode
  /** `narrow` = max-w-2xl (FAQ / profile). `comfortable` = max-w-3xl (managers / forms). */
  size?: 'narrow' | 'comfortable'
  className?: string
}

export function AdminNarrowContent({
  children,
  size = 'comfortable',
  className,
}: AdminNarrowContentProps) {
  return (
    <div
      className={cn(
        'w-full',
        size === 'narrow' ? ADMIN_NARROW_CONTENT_CLASS : ADMIN_COMFORTABLE_CONTENT_CLASS,
        className,
      )}
    >
      {children}
    </div>
  )
}
