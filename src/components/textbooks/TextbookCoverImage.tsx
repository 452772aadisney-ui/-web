import Image from 'next/image'
import { cn } from '@/lib/utils'

interface TextbookCoverImageProps {
  name: string
  coverUrl?: string | null
  className?: string
}

export function TextbookCoverImage({ name, coverUrl, className }: TextbookCoverImageProps) {
  if (coverUrl) {
    return (
      <div
        className={cn(
          'relative shrink-0 overflow-hidden rounded-md border border-border bg-muted/30',
          className,
        )}
      >
        <Image
          src={coverUrl}
          alt={`${name}の表紙`}
          fill
          className="object-cover"
          sizes="80px"
          unoptimized
        />
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md border border-border bg-gradient-to-br from-slate-100 to-slate-200 text-[10px] font-semibold text-muted',
        className,
      )}
      aria-hidden
    >
      参考書
    </div>
  )
}
