import { ADMIN_SHELL_MAX_WIDTH_CLASS } from '@/components/layout/admin-layout'

export default function AdminLoading() {
  const shellWidthClass = `mx-auto w-full ${ADMIN_SHELL_MAX_WIDTH_CLASS}`

  return (
    <div className="min-h-dvh animate-pulse">
      <div className="border-b border-border bg-card px-4 py-4">
        <div className={`${shellWidthClass} space-y-2`}>
          <div className="h-4 w-20 rounded bg-border" />
          <div className="h-6 w-32 rounded bg-border" />
        </div>
      </div>
      <div className="border-b border-border bg-card px-4 py-3">
        <div className={`${shellWidthClass} flex flex-wrap gap-2`}>
          <div className="h-9 w-20 rounded-lg bg-border" />
          <div className="h-9 w-28 rounded-lg bg-border" />
          <div className="h-9 w-24 rounded-lg bg-border" />
        </div>
      </div>
      <main className={`${shellWidthClass} px-4 py-8`}>
        <div className="h-48 rounded-2xl bg-border" />
      </main>
    </div>
  )
}
