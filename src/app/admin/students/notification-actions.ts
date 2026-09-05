'use server'

import { revalidatePath } from 'next/cache'
import {
  updateAdminStudentNotificationPreference,
  updateAdminStudentNotificationPreferencesBulk,
  type AdminNotificationPrefsSnapshot,
} from '@/lib/admin/notification-preferences-admin'

export type AdminStudentNotificationActionResult =
  | { ok: true; snapshot: AdminNotificationPrefsSnapshot }
  | { ok: false; error: string }

export async function setStudentNotificationCategoryAction(input: {
  studentId: string
  category: string
  enabled: boolean
}): Promise<AdminStudentNotificationActionResult> {
  const result = await updateAdminStudentNotificationPreference({
    studentUserId: input.studentId,
    category: input.category,
    enabled: input.enabled,
  })

  if (!result.ok) {
    return { ok: false, error: 'save_failed' }
  }

  revalidatePath(`/admin/students/${input.studentId}`)
  revalidatePath('/dashboard/notifications')
  return { ok: true, snapshot: result.snapshot }
}

export async function setStudentNotificationCategoriesBulkAction(input: {
  studentId: string
  enabled: boolean
}): Promise<AdminStudentNotificationActionResult> {
  const result = await updateAdminStudentNotificationPreferencesBulk({
    studentUserId: input.studentId,
    enabled: input.enabled,
  })

  if (!result.ok) {
    return { ok: false, error: 'save_failed' }
  }

  revalidatePath(`/admin/students/${input.studentId}`)
  revalidatePath('/dashboard/notifications')
  return { ok: true, snapshot: result.snapshot }
}
