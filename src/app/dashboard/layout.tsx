import { PushSubscriptionResync } from '@/components/pwa/PushSubscriptionResync'
import { ServiceWorkerRegister } from '@/components/pwa/ServiceWorkerRegister'

/** Student-area layout: register SW and silently re-sync existing subscriptions. */
export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <>
      {children}
      <ServiceWorkerRegister />
      <PushSubscriptionResync />
    </>
  )
}
