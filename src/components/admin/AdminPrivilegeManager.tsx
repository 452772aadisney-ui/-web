'use client'

import { useActionState } from 'react'
import { getPersonName } from '@/lib/auth/display-name'
import {
  setAdminSuperPrivilegeAction,
  type PrivilegeActionState,
} from '@/app/admin/privileges/actions'

type AdminRow = {
  id: string
  full_name: string
  display_name: string
  email: string
  is_super_admin: boolean
}

const initial: PrivilegeActionState = {}

export function AdminPrivilegeManager(props: {
  admins: AdminRow[]
  currentUserId: string
}) {
  const [state, action, pending] = useActionState(setAdminSuperPrivilegeAction, initial)

  return (
    <div className="space-y-4">
      {state.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          権限を更新しました。開いている画面は再読込してください。
        </p>
      )}

      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {props.admins.map((admin) => {
          const name = getPersonName(admin)
          const isSelf = admin.id === props.currentUserId
          return (
            <li key={admin.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium text-foreground">
                  {name}
                  {isSelf ? '（自分）' : ''}
                </p>
                <p className="text-xs text-muted">{admin.email}</p>
                <p className="mt-1 text-sm text-muted">
                  {admin.is_super_admin ? '大管理者' : '通常管理者'}
                </p>
              </div>
              <form action={action} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="targetId" value={admin.id} />
                <input
                  type="hidden"
                  name="makeSuper"
                  value={admin.is_super_admin ? 'false' : 'true'}
                />
                <label className="flex items-center gap-1.5 text-xs text-muted">
                  <input type="checkbox" name="confirmed" required />
                  確認しました
                </label>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                >
                  {admin.is_super_admin ? '通常管理者へ降格' : '大管理者へ昇格'}
                </button>
              </form>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
