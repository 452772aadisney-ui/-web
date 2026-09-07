/**
 * Shared “active Push registration” definition for admin UI and ops.
 * Active = push_subscriptions row with disabled_at IS NULL.
 * Never select endpoint / p256dh / auth here.
 */
export type PushRegistrationFilter = 'all' | 'registered' | 'unregistered'

export type PushRegistrationStatus = 'registered' | 'unregistered' | 'unknown'

export type PushRegistrationView = {
  status: PushRegistrationStatus
  /** Active device count when known; null when unknown. */
  activeCount: number | null
  label: string
}

export function parsePushRegistrationFilter(
  value: string | null | undefined,
): PushRegistrationFilter {
  if (value === 'registered' || value === 'unregistered') return value
  return 'all'
}

/**
 * Derive display status from an active-subscription count.
 * `null` count means the lookup failed — never treat as registered.
 */
export function derivePushRegistrationView(
  activeCount: number | null,
): PushRegistrationView {
  if (activeCount == null) {
    return { status: 'unknown', activeCount: null, label: '確認不能' }
  }
  if (activeCount <= 0) {
    return { status: 'unregistered', activeCount: 0, label: 'Push未登録' }
  }
  if (activeCount >= 2) {
    return {
      status: 'registered',
      activeCount,
      label: `Push登録済み（${activeCount}台）`,
    }
  }
  return { status: 'registered', activeCount: 1, label: 'Push登録済み' }
}

/**
 * Aggregate active subscription rows (user_id only) for a known student id set.
 * Same semantics as notification ops: count rows with disabled_at IS NULL per user.
 */
export function aggregateActivePushRowsForStudents(
  studentIds: readonly string[],
  activeRows: readonly { user_id: string }[],
): {
  countsByUserId: Map<string, number>
  studentsWithActivePush: number
  studentsWithoutActivePush: number
  activeSubscriptionCount: number
  multiDeviceStudentCount: number
} {
  const studentIdSet = new Set(studentIds)
  const countsByUserId = new Map<string, number>()

  for (const row of activeRows) {
    const userId = String(row.user_id)
    if (!studentIdSet.has(userId)) continue
    countsByUserId.set(userId, (countsByUserId.get(userId) ?? 0) + 1)
  }

  let studentsWithActivePush = 0
  let multiDeviceStudentCount = 0
  let activeSubscriptionCount = 0

  for (const id of studentIds) {
    const n = countsByUserId.get(id) ?? 0
    if (n > 0) {
      studentsWithActivePush += 1
      activeSubscriptionCount += n
    }
    if (n > 1) multiDeviceStudentCount += 1
  }

  return {
    countsByUserId,
    studentsWithActivePush,
    studentsWithoutActivePush: studentIds.length - studentsWithActivePush,
    activeSubscriptionCount,
    multiDeviceStudentCount,
  }
}

export function filterStudentIdsByPushRegistration(
  studentIds: readonly string[],
  countsByUserId: ReadonlyMap<string, number>,
  filter: PushRegistrationFilter,
): string[] {
  if (filter === 'all') return [...studentIds]
  if (filter === 'registered') {
    return studentIds.filter((id) => (countsByUserId.get(id) ?? 0) > 0)
  }
  return studentIds.filter((id) => (countsByUserId.get(id) ?? 0) === 0)
}
