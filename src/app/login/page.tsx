import { LoginForm } from '@/components/auth/LoginForm'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string; error?: string }>
}) {
  const params = await searchParams

  return <LoginForm registered={params.registered === '1'} />
}
