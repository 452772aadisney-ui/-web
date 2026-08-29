import Link from 'next/link'
import { cn } from '@/lib/utils'

export function AdminBookshelfNav({ active }: { active: 'search' | 'create' }) {
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      <Link
        href="/admin/bookshelf/search"
        className={cn(
          'rounded-lg px-4 py-2 text-sm font-medium transition',
          active === 'search'
            ? 'bg-primary text-white'
            : 'border border-border hover:bg-background',
        )}
      >
        参考書を検索
      </Link>
      <Link
        href="/admin/bookshelf/create"
        className={cn(
          'rounded-lg px-4 py-2 text-sm font-medium transition',
          active === 'create'
            ? 'bg-primary text-white'
            : 'border border-border hover:bg-background',
        )}
      >
        新規登録
      </Link>
    </div>
  )
}
