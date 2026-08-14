import { redirect } from 'next/navigation'

export default function AdminTextbooksRedirectPage() {
  redirect('/admin/bookshelf?tab=register')
}
