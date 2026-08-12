export default function DashboardLoading() {
  return (
    <div className="min-h-dvh animate-pulse">
      <div className="border-b border-border bg-card px-4 py-4">
        <div className="mx-auto max-w-3xl space-y-2">
          <div className="h-4 w-20 rounded bg-border" />
          <div className="h-6 w-40 rounded bg-border" />
        </div>
      </div>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="space-y-4">
          <div className="h-20 rounded-2xl bg-border" />
          <div className="h-24 rounded-2xl bg-border" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-20 rounded-2xl bg-border" />
            <div className="h-20 rounded-2xl bg-border" />
            <div className="h-20 rounded-2xl bg-border" />
            <div className="h-20 rounded-2xl bg-border" />
          </div>
        </div>
      </main>
    </div>
  )
}
