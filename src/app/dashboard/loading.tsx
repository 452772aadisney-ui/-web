export default function DashboardLoading() {
  return (
    <div className="min-h-dvh animate-pulse">
      <div className="border-b border-border bg-card px-4 py-4">
        <div className="mx-auto max-w-3xl space-y-2">
          <div className="h-4 w-20 rounded bg-border" />
          <div className="h-6 w-40 rounded bg-border" />
        </div>
      </div>
      <div className="border-b border-border bg-card px-4 py-3">
        <div className="mx-auto flex max-w-3xl gap-2">
          <div className="h-9 w-20 rounded-lg bg-border" />
          <div className="h-9 w-16 rounded-lg bg-border" />
          <div className="h-9 w-24 rounded-lg bg-border" />
        </div>
      </div>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="h-48 rounded-2xl bg-border" />
      </main>
    </div>
  )
}
