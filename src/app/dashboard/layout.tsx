import { ServiceWorkerRegister } from '@/components/pwa/ServiceWorkerRegister'

/** Student-area layout: register SW without affecting /admin. */
export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <>
      {children}
      <ServiceWorkerRegister />
    </>
  )
}
