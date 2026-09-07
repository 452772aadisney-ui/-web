'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { createToastSession } from '@/lib/toast/app-toast'
import type {
  AdminTestInspectResult,
  AdminTestTargetOption,
} from '@/lib/admin/notification-test-service'
import type { StudyReminderIntegrationInspect } from '@/lib/admin/notification-test-study-reminder-integration'
import type {
  CoachingBookingPromptInspect,
  CoachingSessionPreviousDayInspect,
} from '@/lib/admin/notification-test-coaching-integration'
import type { AdminFullDryRunReport } from '@/lib/study/study-reminder-dry-run'
import type { AnnouncementAdminDryRunReport } from '@/lib/announcements/announcement-dry-run'
import type { MessageAdminDryRunReport } from '@/lib/chat/message-dry-run'
import type { CoachingAdminDryRunReport } from '@/lib/coaching/coaching-reminder-dry-run'
import type { ClassScheduleAdminDryRunReport } from '@/lib/class-schedule/class-schedule-dry-run'
import {
  ADMIN_CATEGORY_TEST_FIXTURES,
  ADMIN_CATEGORY_TEST_KINDS,
  type AdminCategoryTestKind,
} from '@/lib/admin/notification-test-config'

type Props = {
  initialFeatureAvailable: boolean
  initialFlagEnabled: boolean
  initialDisabledReason: string | null
  initialTargets: AdminTestTargetOption[]
}

type ApiInspectResponse = { ok: true; inspect: AdminTestInspectResult }

type ApiStudyReminderInspectResponse = {
  ok: true
  studyReminderInspect: StudyReminderIntegrationInspect
}

type ApiStudyReminderSendResponse = {
  ok: true
  sent: boolean
  pushSent: boolean
  emailSent: boolean
  skippedReason: string | null
  failed: boolean
}

type ApiCoachingBookingInspectResponse = {
  ok: true
  coachingBookingInspect: CoachingBookingPromptInspect
}

type ApiCoachingSessionInspectResponse = {
  ok: true
  coachingSessionInspect: CoachingSessionPreviousDayInspect
}

type ApiCoachingIntegrationSendResponse = {
  ok: true
  eligible: boolean
  sent: boolean
  pushSent: boolean
  emailSent: boolean
  chatMessageCreated: boolean
  skippedReason: string | null
  failed: boolean
  processedCount?: number
}

type ApiDryRunResponse = {
  ok: true
  dryRun: AdminFullDryRunReport
  sumConsistent: { readiness: boolean; current: boolean }
  notice: string
}

type ApiAnnouncementDryRunResponse = {
  ok: true
  announcementDryRun: AnnouncementAdminDryRunReport
  notice: string
}

type ApiMessageDryRunResponse = {
  ok: true
  messageDryRun: MessageAdminDryRunReport
  notice: string
}

type ApiCoachingDryRunResponse = {
  ok: true
  coachingDryRun: CoachingAdminDryRunReport
  notice: string
}

type ApiClassScheduleDryRunResponse = {
  ok: true
  classScheduleDryRun: ClassScheduleAdminDryRunReport
  notice: string
}

async function postJson(
  body: Record<string, unknown>,
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; status: number; error: string; retryAfterSeconds?: number }
> {
  try {
    const response = await fetch('/api/admin/notification-test', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })

    let payload: {
      error?: string
      retryAfterSeconds?: number
      ok?: boolean
      inspect?: AdminTestInspectResult
      sent?: number
      dryRun?: AdminFullDryRunReport
      announcementDryRun?: AnnouncementAdminDryRunReport
      messageDryRun?: MessageAdminDryRunReport
      sumConsistent?: { readiness: boolean; current: boolean }
      notice?: string
    } = {}
    try {
      payload = (await response.json()) as typeof payload
    } catch {
      // ignore
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: typeof payload.error === 'string' ? payload.error : 'request_failed',
        retryAfterSeconds:
          typeof payload.retryAfterSeconds === 'number' ? payload.retryAfterSeconds : undefined,
      }
    }

    return { ok: true, data: payload }
  } catch {
    return { ok: false, status: 0, error: 'network' }
  }
}

function disabledReasonMessage(reason: string | null): string {
  switch (reason) {
    case 'flag_off':
      return '現在、通知テスト機能は停止しています（機能フラグOFF）。'
    case 'allowlist_empty':
    case 'allowlist_invalid':
      return '現在、テストアカウント送信は停止しています（テスト対象の設定が無効）。全体dry-runは機能フラグONなら利用できます。'
    case 'admin_unavailable':
      return '現在、通知テスト機能は利用できません。'
    default:
      return '現在、通知テスト機能は停止しています。'
  }
}

function formatEvaluatedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

export function AdminNotificationTestClient({
  initialFeatureAvailable,
  initialFlagEnabled,
  initialDisabledReason,
  initialTargets,
}: Props) {
  const baseId = useId()
  const [targetId, setTargetId] = useState(
    initialTargets.length === 1 ? initialTargets[0]!.id : '',
  )
  const [inspect, setInspect] = useState<AdminTestInspectResult | null>(null)
  const [studyInspect, setStudyInspect] =
    useState<StudyReminderIntegrationInspect | null>(null)
  const [coachingBookingInspect, setCoachingBookingInspect] =
    useState<CoachingBookingPromptInspect | null>(null)
  const [coachingSessionInspect, setCoachingSessionInspect] =
    useState<CoachingSessionPreviousDayInspect | null>(null)
  const [dryRun, setDryRun] = useState<AdminFullDryRunReport | null>(null)
  const [dryRunSumOk, setDryRunSumOk] = useState<{
    readiness: boolean
    current: boolean
  } | null>(null)
  const [announcementDryRun, setAnnouncementDryRun] =
    useState<AnnouncementAdminDryRunReport | null>(null)
  const [messageDryRun, setMessageDryRun] = useState<MessageAdminDryRunReport | null>(null)
  const [coachingDryRun, setCoachingDryRun] = useState<CoachingAdminDryRunReport | null>(null)
  const [classScheduleDryRun, setClassScheduleDryRun] =
    useState<ClassScheduleAdminDryRunReport | null>(null)
  const [category, setCategory] = useState<AdminCategoryTestKind>('study_reminder')
  const [busy, setBusy] = useState<
    | 'inspect'
    | 'push'
    | 'email'
    | 'study-reminder-inspect'
    | 'study-reminder-send'
    | 'coaching-booking-inspect'
    | 'coaching-booking-send'
    | 'coaching-session-inspect'
    | 'coaching-session-send'
    | 'full-dry-run'
    | 'announcement-dry-run'
    | 'message-dry-run'
    | 'coaching-dry-run'
    | 'class-schedule-dry-run'
    | null
  >(null)
  const busyRef = useRef(false)
  const [, startTransition] = useTransition()

  const sendFeatureAvailable = initialFeatureAvailable && initialTargets.length > 0
  const dryRunAvailable = initialFlagEnabled
  const selectedLabel = initialTargets.find((t) => t.id === targetId)?.label ?? ''

  const runStudyReminderInspect = () => {
    if (busyRef.current || !sendFeatureAvailable || !targetId) return

    busyRef.current = true
    setBusy('study-reminder-inspect')
    const toastSession = createToastSession()

    startTransition(async () => {
      try {
        const result = await postJson({
          action: 'study-reminder-inspect',
          targetUserId: targetId,
        })
        if (!result.ok) {
          if (result.error === 'forbidden') {
            toastSession.error('対象を確認できませんでした', 'admin-notification-test-toast')
            return
          }
          toastSession.error(
            '学習記録リマインダーの判定を完了できませんでした',
            'admin-notification-test-toast',
          )
          return
        }
        const data = result.data as ApiStudyReminderInspectResponse
        setStudyInspect(data.studyReminderInspect)
        toastSession.success('判定のみ完了しました（送信していません）', 'admin-notification-test-toast')
      } finally {
        busyRef.current = false
        setBusy(null)
      }
    })
  }

  const runStudyReminderSend = () => {
    if (busyRef.current || !sendFeatureAvailable || !targetId) return
    if (
      !window.confirm(
        [
          '選択したテストアカウント1人だけに、学習記録リマインダーの実経路テストを実行します。',
          selectedLabel ? `対象表示名: ${selectedLabel}` : '',
          '通常の22時Cronは起動しません。一般生徒には送られません。よろしいですか？',
        ]
          .filter(Boolean)
          .join('\n'),
      )
    ) {
      return
    }

    busyRef.current = true
    setBusy('study-reminder-send')
    const toastSession = createToastSession()

    startTransition(async () => {
      try {
        const result = await postJson({
          action: 'study-reminder-send',
          targetUserId: targetId,
        })
        if (!result.ok) {
          if (result.status === 429) {
            toastSession.error(
              result.retryAfterSeconds
                ? `短時間に何度も実行できません。約${result.retryAfterSeconds}秒後に再度お試しください`
                : '短時間に何度も実行できません。しばらくしてから再度お試しください',
              'admin-notification-test-toast',
            )
            return
          }
          if (result.error === 'in_progress') {
            toastSession.error('別の処理が実行中です', 'admin-notification-test-toast')
            return
          }
          toastSession.error('テスト通知を送信できませんでした', 'admin-notification-test-toast')
          return
        }

        const data = result.data as ApiStudyReminderSendResponse
        if (data.skippedReason === 'already_recorded') {
          toastSession.success('記録済みのため対象外です（送信していません）', 'admin-notification-test-toast')
          return
        }
        if (data.skippedReason === 'preference_disabled') {
          toastSession.success('管理者により停止中です（送信していません）', 'admin-notification-test-toast')
          return
        }
        if (data.skippedReason === 'preview') {
          toastSession.success('Previewのため非送信です', 'admin-notification-test-toast')
          return
        }
        if (data.skippedReason === 'undeliverable') {
          toastSession.success('配信手段なしです（送信していません）', 'admin-notification-test-toast')
          return
        }
        if (data.pushSent) {
          toastSession.success('Pushで送信しました（メールなし）', 'admin-notification-test-toast')
          return
        }
        if (data.emailSent) {
          toastSession.success('メールfallbackで送信しました', 'admin-notification-test-toast')
          return
        }
        toastSession.success('実経路テストが完了しました', 'admin-notification-test-toast')
      } finally {
        busyRef.current = false
        setBusy(null)
      }
    })
  }

  const toastCoachingSendResult = (
    toastSession: ReturnType<typeof createToastSession>,
    data: ApiCoachingIntegrationSendResponse,
  ) => {
    if (data.skippedReason === 'already_booked') {
      toastSession.success('今週予約ありのため対象外です（送信していません）', 'admin-notification-test-toast')
      return
    }
    if (data.skippedReason === 'graduate_excluded') {
      toastSession.success('既卒除外のため対象外です（送信していません）', 'admin-notification-test-toast')
      return
    }
    if (data.skippedReason === 'no_scheduled_booking') {
      toastSession.success('明日のscheduled予約がないため対象外です', 'admin-notification-test-toast')
      return
    }
    if (data.skippedReason === 'cancelled_or_changed') {
      toastSession.success('予約が変更・取消されたため送信していません', 'admin-notification-test-toast')
      return
    }
    if (data.skippedReason === 'preference_disabled') {
      toastSession.success(
        data.chatMessageCreated
          ? '管理者により停止中です（チャットのみ作成、通知は送っていません）'
          : '管理者により停止中です（送信していません）',
        'admin-notification-test-toast',
      )
      return
    }
    if (data.skippedReason === 'preview') {
      toastSession.success('Previewのため非送信です', 'admin-notification-test-toast')
      return
    }
    if (data.skippedReason === 'undeliverable') {
      toastSession.success('配信手段なしです（送信していません）', 'admin-notification-test-toast')
      return
    }
    if (data.pushSent) {
      toastSession.success(
        data.chatMessageCreated
          ? 'Pushで送信しました（チャット追加あり・メールなし）'
          : 'Pushで送信しました（メールなし）',
        'admin-notification-test-toast',
      )
      return
    }
    if (data.emailSent) {
      toastSession.success(
        data.chatMessageCreated
          ? 'メールfallbackで送信しました（チャット追加あり）'
          : 'メールfallbackで送信しました',
        'admin-notification-test-toast',
      )
      return
    }
    toastSession.success('実経路テストが完了しました', 'admin-notification-test-toast')
  }

  const runCoachingBookingInspect = () => {
    if (busyRef.current || !sendFeatureAvailable || !targetId) return
    busyRef.current = true
    setBusy('coaching-booking-inspect')
    const toastSession = createToastSession()
    startTransition(async () => {
      try {
        const result = await postJson({
          action: 'coaching-booking-inspect',
          targetUserId: targetId,
        })
        if (!result.ok) {
          toastSession.error(
            result.error === 'forbidden'
              ? '対象を確認できませんでした'
              : '予約催促の判定を完了できませんでした',
            'admin-notification-test-toast',
          )
          return
        }
        const data = result.data as ApiCoachingBookingInspectResponse
        setCoachingBookingInspect(data.coachingBookingInspect)
        toastSession.success('判定のみ完了しました（送信していません）', 'admin-notification-test-toast')
      } finally {
        busyRef.current = false
        setBusy(null)
      }
    })
  }

  const runCoachingBookingSend = () => {
    if (busyRef.current || !sendFeatureAvailable || !targetId) return
    if (
      !window.confirm(
        [
          '選択したテストアカウント1人だけに、今週のコーチング予約催促の実経路テストを実行します。',
          selectedLabel ? `対象表示名: ${selectedLabel}` : '',
          'テストアカウントのチャットにも予約催促が1件追加されます。',
          '通常の月曜Cronは起動しません。一般生徒には送られません。よろしいですか？',
        ]
          .filter(Boolean)
          .join('\n'),
      )
    ) {
      return
    }

    busyRef.current = true
    setBusy('coaching-booking-send')
    const toastSession = createToastSession()
    startTransition(async () => {
      try {
        const result = await postJson({
          action: 'coaching-booking-send',
          targetUserId: targetId,
        })
        if (!result.ok) {
          if (result.status === 429) {
            toastSession.error(
              result.retryAfterSeconds
                ? `短時間に何度も実行できません。約${result.retryAfterSeconds}秒後に再度お試しください`
                : '短時間に何度も実行できません。しばらくしてから再度お試しください',
              'admin-notification-test-toast',
            )
            return
          }
          if (result.error === 'in_progress') {
            toastSession.error('別の処理が実行中です', 'admin-notification-test-toast')
            return
          }
          toastSession.error('テスト通知を送信できませんでした', 'admin-notification-test-toast')
          return
        }
        toastCoachingSendResult(
          toastSession,
          result.data as ApiCoachingIntegrationSendResponse,
        )
      } finally {
        busyRef.current = false
        setBusy(null)
      }
    })
  }

  const runCoachingSessionInspect = () => {
    if (busyRef.current || !sendFeatureAvailable || !targetId) return
    busyRef.current = true
    setBusy('coaching-session-inspect')
    const toastSession = createToastSession()
    startTransition(async () => {
      try {
        const result = await postJson({
          action: 'coaching-session-inspect',
          targetUserId: targetId,
        })
        if (!result.ok) {
          toastSession.error(
            result.error === 'forbidden'
              ? '対象を確認できませんでした'
              : '前日案内の判定を完了できませんでした',
            'admin-notification-test-toast',
          )
          return
        }
        const data = result.data as ApiCoachingSessionInspectResponse
        setCoachingSessionInspect(data.coachingSessionInspect)
        toastSession.success('判定のみ完了しました（送信していません）', 'admin-notification-test-toast')
      } finally {
        busyRef.current = false
        setBusy(null)
      }
    })
  }

  const runCoachingSessionSend = () => {
    if (busyRef.current || !sendFeatureAvailable || !targetId) return
    if (
      !window.confirm(
        [
          '選択したテストアカウント1人だけに、コーチング前日案内の実経路テストを実行します。',
          selectedLabel ? `対象表示名: ${selectedLabel}` : '',
          '明日のscheduled予約がある場合のみ送信します（予約は作成・変更しません）。',
          '通常の20時Cronは起動しません。一般生徒には送られません。よろしいですか？',
        ]
          .filter(Boolean)
          .join('\n'),
      )
    ) {
      return
    }

    busyRef.current = true
    setBusy('coaching-session-send')
    const toastSession = createToastSession()
    startTransition(async () => {
      try {
        const result = await postJson({
          action: 'coaching-session-send',
          targetUserId: targetId,
        })
        if (!result.ok) {
          if (result.status === 429) {
            toastSession.error(
              result.retryAfterSeconds
                ? `短時間に何度も実行できません。約${result.retryAfterSeconds}秒後に再度お試しください`
                : '短時間に何度も実行できません。しばらくしてから再度お試しください',
              'admin-notification-test-toast',
            )
            return
          }
          if (result.error === 'in_progress') {
            toastSession.error('別の処理が実行中です', 'admin-notification-test-toast')
            return
          }
          toastSession.error('テスト通知を送信できませんでした', 'admin-notification-test-toast')
          return
        }
        toastCoachingSendResult(
          toastSession,
          result.data as ApiCoachingIntegrationSendResponse,
        )
      } finally {
        busyRef.current = false
        setBusy(null)
      }
    })
  }

  const runSendAction = (action: 'inspect' | 'push' | 'email', confirmMessage?: string) => {
    if (busyRef.current || !sendFeatureAvailable || !targetId) return
    if (confirmMessage && !window.confirm(confirmMessage)) return

    busyRef.current = true
    setBusy(action)
    const toastSession = createToastSession()

    startTransition(async () => {
      try {
        const result = await postJson({
          action,
          targetUserId: targetId,
          category: action === 'inspect' ? undefined : category,
        })
        if (!result.ok) {
          if (result.status === 429) {
            toastSession.error(
              result.retryAfterSeconds
                ? `短時間に何度も実行できません。約${result.retryAfterSeconds}秒後に再度お試しください`
                : '短時間に何度も実行できません。しばらくしてから再度お試しください',
              'admin-notification-test-toast',
            )
            return
          }
          if (result.error === 'no_subscriptions') {
            toastSession.error('有効なPush購読がありません', 'admin-notification-test-toast')
            return
          }
          if (result.error === 'no_email') {
            toastSession.error('テスト用のメール送信先がありません', 'admin-notification-test-toast')
            return
          }
          if (result.error === 'push_disabled') {
            toastSession.error('Push送信機能が無効です', 'admin-notification-test-toast')
            return
          }
          toastSession.error(
            action === 'inspect'
              ? '処理に失敗しました。もう一度お試しください'
              : 'テスト通知を送信できませんでした',
            'admin-notification-test-toast',
          )
          return
        }

        if (action === 'inspect') {
          const data = result.data as ApiInspectResponse
          setInspect(data.inspect)
          toastSession.success('状態を確認しました', 'admin-notification-test-toast')
          return
        }
        if (action === 'push') {
          toastSession.success('テストPushを送信しました', 'admin-notification-test-toast')
          return
        }
        toastSession.success('テストメールを送信しました', 'admin-notification-test-toast')
      } finally {
        busyRef.current = false
        setBusy(null)
      }
    })
  }

  const runFullDryRun = () => {
    if (busyRef.current || !dryRunAvailable) return

    busyRef.current = true
    setBusy('full-dry-run')
    const toastSession = createToastSession()

    startTransition(async () => {
      try {
        const result = await postJson({ action: 'full-dry-run' })
        if (!result.ok) {
          if (result.status === 429) {
            toastSession.error(
              result.retryAfterSeconds
                ? `短時間に何度も実行できません。約${result.retryAfterSeconds}秒後に再度お試しください`
                : '短時間に何度も実行できません。しばらくしてから再度お試しください',
              'admin-notification-test-toast',
            )
            return
          }
          if (result.error === 'in_progress') {
            toastSession.error('dry-runの実行中です。完了後に再度お試しください', 'admin-notification-test-toast')
            return
          }
          toastSession.error('dry-runを完了できませんでした', 'admin-notification-test-toast')
          return
        }

        const data = result.data as ApiDryRunResponse
        setDryRun(data.dryRun)
        setDryRunSumOk(data.sumConsistent)
        toastSession.success('dry-runの集計が完了しました', 'admin-notification-test-toast')
      } finally {
        busyRef.current = false
        setBusy(null)
      }
    })
  }

  const runAnnouncementDryRun = () => {
    if (busyRef.current || !dryRunAvailable) return

    busyRef.current = true
    setBusy('announcement-dry-run')
    const toastSession = createToastSession()

    startTransition(async () => {
      try {
        const result = await postJson({ action: 'announcement-dry-run' })
        if (!result.ok) {
          if (result.status === 429) {
            toastSession.error(
              result.retryAfterSeconds
                ? `短時間に何度も実行できません。約${result.retryAfterSeconds}秒後に再度お試しください`
                : '短時間に何度も実行できません。しばらくしてから再度お試しください',
              'admin-notification-test-toast',
            )
            return
          }
          if (result.error === 'in_progress') {
            toastSession.error('dry-runの実行中です。完了後に再度お試しください', 'admin-notification-test-toast')
            return
          }
          toastSession.error('お知らせ通知の準備状況を取得できませんでした', 'admin-notification-test-toast')
          return
        }

        const data = result.data as ApiAnnouncementDryRunResponse
        setAnnouncementDryRun(data.announcementDryRun)
        toastSession.success('お知らせ通知の準備状況を集計しました', 'admin-notification-test-toast')
      } finally {
        busyRef.current = false
        setBusy(null)
      }
    })
  }

  const runMessageDryRun = () => {
    if (busyRef.current || !dryRunAvailable) return

    busyRef.current = true
    setBusy('message-dry-run')
    const toastSession = createToastSession()

    startTransition(async () => {
      try {
        const result = await postJson({ action: 'message-dry-run' })
        if (!result.ok) {
          if (result.status === 429) {
            toastSession.error(
              result.retryAfterSeconds
                ? `短時間に何度も実行できません。約${result.retryAfterSeconds}秒後に再度お試しください`
                : '短時間に何度も実行できません。しばらくしてから再度お試しください',
              'admin-notification-test-toast',
            )
            return
          }
          if (result.error === 'in_progress') {
            toastSession.error('dry-runの実行中です。完了後に再度お試しください', 'admin-notification-test-toast')
            return
          }
          toastSession.error('メッセージ通知の準備状況を取得できませんでした', 'admin-notification-test-toast')
          return
        }

        const data = result.data as ApiMessageDryRunResponse
        setMessageDryRun(data.messageDryRun)
        toastSession.success('メッセージ通知の準備状況を集計しました', 'admin-notification-test-toast')
      } finally {
        busyRef.current = false
        setBusy(null)
      }
    })
  }

  const runCoachingDryRun = () => {
    if (busyRef.current || !dryRunAvailable) return

    busyRef.current = true
    setBusy('coaching-dry-run')
    const toastSession = createToastSession()

    startTransition(async () => {
      try {
        const result = await postJson({ action: 'coaching-dry-run' })
        if (!result.ok) {
          if (result.status === 429) {
            toastSession.error(
              result.retryAfterSeconds
                ? `短時間に何度も実行できません。約${result.retryAfterSeconds}秒後に再度お試しください`
                : '短時間に何度も実行できません。しばらくしてから再度お試しください',
              'admin-notification-test-toast',
            )
            return
          }
          if (result.error === 'in_progress') {
            toastSession.error('dry-runの実行中です。完了後に再度お試しください', 'admin-notification-test-toast')
            return
          }
          toastSession.error('コーチング通知の準備状況を取得できませんでした', 'admin-notification-test-toast')
          return
        }

        const data = result.data as ApiCoachingDryRunResponse
        setCoachingDryRun(data.coachingDryRun)
        toastSession.success('コーチング通知の準備状況を集計しました', 'admin-notification-test-toast')
      } finally {
        busyRef.current = false
        setBusy(null)
      }
    })
  }

  const runClassScheduleDryRun = () => {
    if (busyRef.current || !dryRunAvailable) return

    busyRef.current = true
    setBusy('class-schedule-dry-run')
    const toastSession = createToastSession()

    startTransition(async () => {
      try {
        const result = await postJson({ action: 'class-schedule-dry-run' })
        if (!result.ok) {
          if (result.status === 429) {
            toastSession.error(
              result.retryAfterSeconds
                ? `短時間に何度も実行できません。約${result.retryAfterSeconds}秒後に再度お試しください`
                : '短時間に何度も実行できません。しばらくしてから再度お試しください',
              'admin-notification-test-toast',
            )
            return
          }
          if (result.error === 'in_progress') {
            toastSession.error('dry-runの実行中です。完了後に再度お試しください', 'admin-notification-test-toast')
            return
          }
          toastSession.error('授業予定通知の準備状況を取得できませんでした', 'admin-notification-test-toast')
          return
        }

        const data = result.data as ApiClassScheduleDryRunResponse
        setClassScheduleDryRun(data.classScheduleDryRun)
        toastSession.success('授業予定通知の準備状況を集計しました', 'admin-notification-test-toast')
      } finally {
        busyRef.current = false
        setBusy(null)
      }
    })
  }

  return (
    <div className="space-y-8" aria-busy={busy !== null}>
      <section
        className="rounded-2xl border border-border bg-card p-5 shadow-sm"
        aria-labelledby={`${baseId}-dry-run-heading`}
      >
        <h2 id={`${baseId}-dry-run-heading`} className="text-base font-bold text-foreground">
          全体dry-run
        </h2>
        <p className="mt-2 text-sm text-muted">
          現在のデータを使って、22:00の新しい通知方式なら何人が各処理の対象になるか確認します。Push・メールは送信しません。
        </p>

        {!dryRunAvailable ? (
          <p className="mt-4 text-sm text-muted" role="status">
            {disabledReasonMessage(initialDisabledReason ?? 'flag_off')}
          </p>
        ) : (
          <>
            <button
              type="button"
              className="mt-4 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-card disabled:opacity-60"
              disabled={busy !== null}
              onClick={runFullDryRun}
            >
              {busy === 'full-dry-run' ? '集計中…' : '全体dry-runを実行'}
            </button>

            {dryRun && (
              <div className="mt-4 space-y-4" aria-live="polite">
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-foreground">
                  これは判定結果の確認です。Push・メールは送信されていません。
                </p>
                <dl className="grid gap-2 text-sm text-foreground sm:grid-cols-2">
                  <div>
                    <dt className="text-muted">対象日（JST）</dt>
                    <dd className="font-medium">{dryRun.dateKey}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">実行日時</dt>
                    <dd className="font-medium">{formatEvaluatedAt(dryRun.evaluatedAt)}</dd>
                  </div>
                  {typeof dryRun.durationMs === 'number' ? (
                    <div>
                      <dt className="text-muted">処理時間</dt>
                      <dd className="font-medium">{dryRun.durationMs} ms</dd>
                    </div>
                  ) : null}
                </dl>

                <section
                  className="rounded-xl border border-border bg-background p-4"
                  aria-labelledby={`${baseId}-readiness-heading`}
                >
                  <h3
                    id={`${baseId}-readiness-heading`}
                    className="text-sm font-semibold text-foreground"
                  >
                    Pushを有効化した場合の準備状況
                  </h3>
                  <p className="mt-1 text-sm text-muted">
                    準備状況は、Push送信を有効にした場合の想定です。このdry-runでは実際の通知は送信していません。
                  </p>
                  <dl className="mt-3 grid gap-2 text-sm text-foreground sm:grid-cols-2">
                    <div>
                      <dt className="text-muted">生徒数</dt>
                      <dd className="font-medium">{dryRun.readiness.totalStudents}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">本日記録済み</dt>
                      <dd className="font-medium">{dryRun.readiness.alreadyRecorded}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">本日未記録</dt>
                      <dd className="font-medium">{dryRun.readiness.missingStudyLog}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">通知設定ON（設定行なし含む）</dt>
                      <dd className="font-medium">{dryRun.readiness.preferenceEnabled}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">管理者により停止</dt>
                      <dd className="font-medium">{dryRun.readiness.preferenceDisabled}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">有効Push購読あり</dt>
                      <dd className="font-medium">
                        {dryRun.readiness.withActivePushSubscription}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">有効Push購読なし</dt>
                      <dd className="font-medium">
                        {dryRun.readiness.withoutActivePushSubscription}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">メールあり</dt>
                      <dd className="font-medium">{dryRun.readiness.withEmail}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">メールなし</dt>
                      <dd className="font-medium">{dryRun.readiness.withoutEmail}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Push有効化時のPush対象</dt>
                      <dd className="font-medium">{dryRun.readiness.readyForPush}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Push有効化時のメールfallback</dt>
                      <dd className="font-medium">{dryRun.readiness.emailOnly}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">配信手段なし</dt>
                      <dd className="font-medium">{dryRun.readiness.cannotDeliver}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">判定エラー</dt>
                      <dd className="font-medium">{dryRun.readiness.failedToEvaluate}</dd>
                    </div>
                  </dl>
                  {dryRunSumOk?.readiness === false ? (
                    <p className="mt-2 text-sm text-amber-800" role="status">
                      準備状況の最終分類合計が生徒数と一致しません。
                    </p>
                  ) : null}
                </section>

                <section
                  className="rounded-xl border border-border bg-background p-4"
                  aria-labelledby={`${baseId}-current-heading`}
                >
                  <h3
                    id={`${baseId}-current-heading`}
                    className="text-sm font-semibold text-foreground"
                  >
                    現在の本番設定での動作
                  </h3>
                  <p className="mt-1 text-sm text-muted">
                    {dryRun.current.legacyEmailPreferred
                      ? '通常配信モードが legacy / dry-run のため、実配信は従来メールが優先されます（Pushは送りません）。'
                      : '通常配信モードに沿った新方式の分岐です。Push送信機能がOFFならPush対象は0になります。'}
                  </p>
                  <dl className="mt-3 grid gap-2 text-sm text-foreground sm:grid-cols-2">
                    <div>
                      <dt className="text-muted">通常配信モード</dt>
                      <dd className="font-medium">{dryRun.current.deliveryMode}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Push送信機能</dt>
                      <dd className="font-medium">
                        {dryRun.current.pushSendingEnabled ? 'ON' : 'OFF'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">生徒数</dt>
                      <dd className="font-medium">{dryRun.current.totalStudents}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">本日記録済み</dt>
                      <dd className="font-medium">{dryRun.current.alreadyRecorded}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">管理者により停止</dt>
                      <dd className="font-medium">{dryRun.current.preferenceDisabled}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">現在設定でのPush対象</dt>
                      <dd className="font-medium">{dryRun.current.wouldUsePush}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">現在設定でのメール経路</dt>
                      <dd className="font-medium">{dryRun.current.wouldUseEmail}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">配信手段なし</dt>
                      <dd className="font-medium">{dryRun.current.cannotDeliver}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">判定エラー</dt>
                      <dd className="font-medium">{dryRun.current.failedToEvaluate}</dd>
                    </div>
                  </dl>
                  {dryRunSumOk?.current === false ? (
                    <p className="mt-2 text-sm text-amber-800" role="status">
                      現在設定の最終分類合計が生徒数と一致しません。
                    </p>
                  ) : null}
                </section>
              </div>
            )}
          </>
        )}
      </section>

      <section
        className="rounded-2xl border border-border bg-card p-5 shadow-sm"
        aria-labelledby={`${baseId}-announcement-dry-run-heading`}
      >
        <h2
          id={`${baseId}-announcement-dry-run-heading`}
          className="text-base font-bold text-foreground"
        >
          お知らせ通知の準備状況
        </h2>
        <p className="mt-2 text-sm text-muted">
          全員配信を想定した準備状況です。お知らせの作成・Push・メールは行いません。
        </p>

        {!dryRunAvailable ? (
          <p className="mt-4 text-sm text-muted" role="status">
            {disabledReasonMessage(initialDisabledReason ?? 'flag_off')}
          </p>
        ) : (
          <>
            <button
              type="button"
              className="mt-4 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-card disabled:opacity-60"
              disabled={busy !== null}
              onClick={runAnnouncementDryRun}
            >
              {busy === 'announcement-dry-run' ? '集計中…' : '準備状況を集計'}
            </button>

            {announcementDryRun && (
              <div className="mt-4 space-y-4" aria-live="polite">
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-foreground">
                  これは判定結果の確認です。お知らせ作成・通知送信は行われていません。
                </p>
                <section aria-labelledby={`${baseId}-announcement-readiness-heading`}>
                  <h3
                    id={`${baseId}-announcement-readiness-heading`}
                    className="text-sm font-semibold text-foreground"
                  >
                    Push準備状況（送信フラグに依存しない）
                  </h3>
                  <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted">対象生徒数</dt>
                      <dd className="font-medium">{announcementDryRun.readiness.recipients}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">管理者により停止</dt>
                      <dd className="font-medium">
                        {announcementDryRun.readiness.preferenceDisabled}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Push準備済み</dt>
                      <dd className="font-medium">{announcementDryRun.readiness.pushReady}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">メールfallback候補</dt>
                      <dd className="font-medium">{announcementDryRun.readiness.emailFallback}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">配信手段なし</dt>
                      <dd className="font-medium">{announcementDryRun.readiness.cannotDeliver}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">判定エラー</dt>
                      <dd className="font-medium">{announcementDryRun.readiness.failed}</dd>
                    </div>
                  </dl>
                </section>
                <section aria-labelledby={`${baseId}-announcement-current-heading`}>
                  <h3
                    id={`${baseId}-announcement-current-heading`}
                    className="text-sm font-semibold text-foreground"
                  >
                    現在設定での有効経路（mode={announcementDryRun.current.mode} / Push送信=
                    {announcementDryRun.current.pushSendingEnabled ? 'ON' : 'OFF'}）
                  </h3>
                  <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted">Push対象</dt>
                      <dd className="font-medium">{announcementDryRun.current.wouldUsePush}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">メール経路</dt>
                      <dd className="font-medium">
                        {announcementDryRun.current.wouldFallbackEmail}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">管理者により停止</dt>
                      <dd className="font-medium">
                        {announcementDryRun.current.preferenceDisabled}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">配信手段なし</dt>
                      <dd className="font-medium">{announcementDryRun.current.cannotDeliver}</dd>
                    </div>
                  </dl>
                </section>
              </div>
            )}
          </>
        )}
      </section>

      <section
        className="rounded-2xl border border-border bg-card p-5 shadow-sm"
        aria-labelledby={`${baseId}-message-dry-run-heading`}
      >
        <h2
          id={`${baseId}-message-dry-run-heading`}
          className="text-base font-bold text-foreground"
        >
          メッセージ通知の準備状況
        </h2>
        <p className="mt-2 text-sm text-muted">
          全生徒の構造的な準備状況です。実際の受信者はメッセージ送信時にのみ確定します。メッセージ作成・Push・メールは行いません。
        </p>

        {!dryRunAvailable ? (
          <p className="mt-4 text-sm text-muted" role="status">
            {disabledReasonMessage(initialDisabledReason ?? 'flag_off')}
          </p>
        ) : (
          <>
            <button
              type="button"
              className="mt-4 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-card disabled:opacity-60"
              disabled={busy !== null}
              onClick={runMessageDryRun}
            >
              {busy === 'message-dry-run' ? '集計中…' : '準備状況を集計'}
            </button>

            {messageDryRun && (
              <div className="mt-4 space-y-4" aria-live="polite">
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-foreground">
                  これは全生徒の準備状況です。実際の通知対象は管理者→生徒の通常メッセージ送信時に決まります。
                </p>
                <section aria-labelledby={`${baseId}-message-readiness-heading`}>
                  <h3
                    id={`${baseId}-message-readiness-heading`}
                    className="text-sm font-semibold text-foreground"
                  >
                    Push準備状況（送信フラグに依存しない）
                  </h3>
                  <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted">対象生徒数</dt>
                      <dd className="font-medium">{messageDryRun.readiness.recipients}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">管理者により停止</dt>
                      <dd className="font-medium">{messageDryRun.readiness.preferenceDisabled}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Push準備済み</dt>
                      <dd className="font-medium">{messageDryRun.readiness.pushReady}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">メールfallback候補</dt>
                      <dd className="font-medium">{messageDryRun.readiness.emailFallback}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">配信手段なし</dt>
                      <dd className="font-medium">{messageDryRun.readiness.cannotDeliver}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">判定エラー</dt>
                      <dd className="font-medium">{messageDryRun.readiness.failed}</dd>
                    </div>
                  </dl>
                </section>
                <section aria-labelledby={`${baseId}-message-current-heading`}>
                  <h3
                    id={`${baseId}-message-current-heading`}
                    className="text-sm font-semibold text-foreground"
                  >
                    現在設定での有効経路（mode={messageDryRun.current.mode} / Push送信=
                    {messageDryRun.current.pushSendingEnabled ? 'ON' : 'OFF'}）
                  </h3>
                  <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted">Push対象</dt>
                      <dd className="font-medium">{messageDryRun.current.wouldUsePush}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">メール経路</dt>
                      <dd className="font-medium">{messageDryRun.current.wouldFallbackEmail}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">管理者により停止</dt>
                      <dd className="font-medium">{messageDryRun.current.preferenceDisabled}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">配信手段なし</dt>
                      <dd className="font-medium">{messageDryRun.current.cannotDeliver}</dd>
                    </div>
                  </dl>
                </section>
              </div>
            )}
          </>
        )}
      </section>

      <section
        className="rounded-2xl border border-border bg-card p-5 shadow-sm"
        aria-labelledby={`${baseId}-coaching-dry-run-heading`}
      >
        <h2
          id={`${baseId}-coaching-dry-run-heading`}
          className="text-base font-bold text-foreground"
        >
          コーチング通知の準備状況
        </h2>
        <p className="mt-2 text-sm text-muted">
          週次の予約催促と、予約前日案内の準備状況です。チャット作成・Push・メール・予約変更は行いません。
        </p>

        {!dryRunAvailable ? (
          <p className="mt-4 text-sm text-muted" role="status">
            {disabledReasonMessage(initialDisabledReason ?? 'flag_off')}
          </p>
        ) : (
          <>
            <button
              type="button"
              className="mt-4 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-card disabled:opacity-60"
              disabled={busy !== null}
              onClick={runCoachingDryRun}
            >
              {busy === 'coaching-dry-run' ? '集計中…' : '準備状況を集計'}
            </button>

            {coachingDryRun && (
              <div className="mt-4 space-y-6" aria-live="polite">
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-foreground">
                  これは判定結果の確認です。通知送信・チャット作成は行われていません（mode=
                  {coachingDryRun.mode} / Push送信=
                  {coachingDryRun.pushSendingEnabled ? 'ON' : 'OFF'}）。
                </p>

                <section aria-labelledby={`${baseId}-coaching-booking-heading`}>
                  <h3
                    id={`${baseId}-coaching-booking-heading`}
                    className="text-sm font-semibold text-foreground"
                  >
                    週次予約催促（週開始 {coachingDryRun.bookingPrompt.weekMondayKey}）
                  </h3>
                  <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted">コーチング対象・今週未予約</dt>
                      <dd className="font-medium">
                        {coachingDryRun.bookingPrompt.coachingEligibleUnbooked}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">今週予約済み</dt>
                      <dd className="font-medium">{coachingDryRun.bookingPrompt.bookedThisWeek}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">管理者により停止</dt>
                      <dd className="font-medium">
                        {coachingDryRun.bookingPrompt.preferenceDisabled}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Push準備済み</dt>
                      <dd className="font-medium">{coachingDryRun.bookingPrompt.pushReady}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">メールfallback</dt>
                      <dd className="font-medium">{coachingDryRun.bookingPrompt.emailFallback}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">配信手段なし</dt>
                      <dd className="font-medium">{coachingDryRun.bookingPrompt.cannotDeliver}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">判定エラー</dt>
                      <dd className="font-medium">{coachingDryRun.bookingPrompt.failed}</dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-xs text-muted">
                    現在設定: Push {coachingDryRun.bookingPromptCurrent.wouldUsePush} / メール{' '}
                    {coachingDryRun.bookingPromptCurrent.wouldFallbackEmail} / 停止{' '}
                    {coachingDryRun.bookingPromptCurrent.preferenceDisabled} / 手段なし{' '}
                    {coachingDryRun.bookingPromptCurrent.cannotDeliver}
                  </p>
                </section>

                <section aria-labelledby={`${baseId}-coaching-session-heading`}>
                  <h3
                    id={`${baseId}-coaching-session-heading`}
                    className="text-sm font-semibold text-foreground"
                  >
                    予約前日案内（翌日 {coachingDryRun.sessionPreviousDay.tomorrowKey}）
                  </h3>
                  <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted">翌日の有効予約</dt>
                      <dd className="font-medium">
                        {coachingDryRun.sessionPreviousDay.validBookingsTomorrow}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">管理者により停止</dt>
                      <dd className="font-medium">
                        {coachingDryRun.sessionPreviousDay.preferenceDisabled}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Push準備済み</dt>
                      <dd className="font-medium">{coachingDryRun.sessionPreviousDay.pushReady}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">メールfallback</dt>
                      <dd className="font-medium">
                        {coachingDryRun.sessionPreviousDay.emailFallback}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">配信手段なし</dt>
                      <dd className="font-medium">
                        {coachingDryRun.sessionPreviousDay.cannotDeliver}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">判定エラー</dt>
                      <dd className="font-medium">{coachingDryRun.sessionPreviousDay.failed}</dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-xs text-muted">
                    現在設定: Push {coachingDryRun.sessionPreviousDayCurrent.wouldUsePush} / メール{' '}
                    {coachingDryRun.sessionPreviousDayCurrent.wouldFallbackEmail} / 停止{' '}
                    {coachingDryRun.sessionPreviousDayCurrent.preferenceDisabled} / 手段なし{' '}
                    {coachingDryRun.sessionPreviousDayCurrent.cannotDeliver}
                  </p>
                </section>
              </div>
            )}
          </>
        )}
      </section>

      <section
        className="rounded-2xl border border-border bg-card p-5 shadow-sm"
        aria-labelledby={`${baseId}-class-schedule-dry-run-heading`}
      >
        <h2
          id={`${baseId}-class-schedule-dry-run-heading`}
          className="text-base font-bold text-foreground"
        >
          授業予定通知の準備状況
        </h2>
        <p className="mt-2 text-sm text-muted">
          学年=既卒の生徒向け授業予定通知の準備状況です。Push・メールは送信しません。
        </p>

        {!dryRunAvailable ? (
          <p className="mt-4 text-sm text-muted" role="status">
            {disabledReasonMessage(initialDisabledReason ?? 'flag_off')}
          </p>
        ) : (
          <>
            <button
              type="button"
              className="mt-4 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-card disabled:opacity-60"
              disabled={busy !== null}
              onClick={runClassScheduleDryRun}
            >
              {busy === 'class-schedule-dry-run' ? '集計中…' : '準備状況を集計'}
            </button>

            {classScheduleDryRun && (
              <div className="mt-4 space-y-4" aria-live="polite">
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-foreground">
                  これは判定結果の確認です。通知は送信されていません（mode=
                  {classScheduleDryRun.current.mode} / Push送信=
                  {classScheduleDryRun.current.pushSendingEnabled ? 'ON' : 'OFF'}
                  {classScheduleDryRun.current.allowlistCount != null
                    ? ` / allowlist=${classScheduleDryRun.current.allowlistCount}`
                    : ''}
                  ）。
                </p>
                <dl className="grid gap-2 text-sm text-foreground sm:grid-cols-2">
                  <div>
                    <dt className="text-muted">既卒生徒数</dt>
                    <dd className="font-medium">{classScheduleDryRun.readiness.kisotsuTotal}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">管理者により停止</dt>
                    <dd className="font-medium">
                      {classScheduleDryRun.readiness.preferenceDisabled}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Push準備済み</dt>
                    <dd className="font-medium">{classScheduleDryRun.readiness.pushReady}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">メールfallback</dt>
                    <dd className="font-medium">{classScheduleDryRun.readiness.emailFallback}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">配信手段なし</dt>
                    <dd className="font-medium">{classScheduleDryRun.readiness.cannotDeliver}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">判定エラー</dt>
                    <dd className="font-medium">{classScheduleDryRun.readiness.failed}</dd>
                  </div>
                </dl>
                <p className="text-xs text-muted">
                  現在設定: Push {classScheduleDryRun.current.wouldUsePush} / メール{' '}
                  {classScheduleDryRun.current.wouldFallbackEmail} / 停止{' '}
                  {classScheduleDryRun.current.preferenceDisabled} / 手段なし{' '}
                  {classScheduleDryRun.current.cannotDeliver}
                </p>
              </div>
            )}
          </>
        )}
      </section>

      <div className="border-t border-border pt-2">
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-foreground">
          以下は許可されたテストアカウントだけへの実送信・個別確認です。全体dry-runとは別の操作です。
        </p>
      </div>

      {!sendFeatureAvailable ? (
        <p className="text-sm text-muted" role="status">
          {disabledReasonMessage(initialDisabledReason)}
        </p>
      ) : (
        <>
          <section
            className="rounded-2xl border border-border bg-card p-5 shadow-sm"
            aria-labelledby={`${baseId}-target-heading`}
          >
            <h2 id={`${baseId}-target-heading`} className="text-base font-bold text-foreground">
              テストアカウント
            </h2>
            <label className="mt-3 block text-sm text-muted" htmlFor={`${baseId}-target`}>
              対象生徒（許可されたテストアカウントのみ）
            </label>
            <select
              id={`${baseId}-target`}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground"
              value={targetId}
              onChange={(event) => {
                setTargetId(event.target.value)
                setInspect(null)
                setStudyInspect(null)
                setCoachingBookingInspect(null)
                setCoachingSessionInspect(null)
              }}
              disabled={busy !== null}
            >
              <option value="">選択してください</option>
              {initialTargets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.label}
                </option>
              ))}
            </select>

            <label className="mt-4 block text-sm text-muted" htmlFor={`${baseId}-category`}>
              固定テスト種別（文面・URLはサーバー固定。自由入力不可）
            </label>
            <select
              id={`${baseId}-category`}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground"
              value={category}
              onChange={(event) => setCategory(event.target.value as AdminCategoryTestKind)}
              disabled={busy !== null}
            >
              {ADMIN_CATEGORY_TEST_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {ADMIN_CATEGORY_TEST_FIXTURES[kind].label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-muted">
              Push本文: {ADMIN_CATEGORY_TEST_FIXTURES[category].pushBody}
              <br />
              遷移先: {ADMIN_CATEGORY_TEST_FIXTURES[category].targetPath}
            </p>
          </section>

          <section
            className="rounded-2xl border border-border bg-card p-5 shadow-sm"
            aria-labelledby={`${baseId}-study-path-heading`}
          >
            <h2 id={`${baseId}-study-path-heading`} className="text-base font-bold text-foreground">
              学習記録リマインダー実経路テスト
            </h2>
            <p className="mt-2 text-sm text-muted">
              通常の22時Cronを起動せず、選択したテストアカウント1人だけを現在の学習記録リマインダー経路で判定・送信します。
              通常の日次冪等性キーは使いません。
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-card disabled:opacity-60"
                disabled={!targetId || busy !== null}
                onClick={runStudyReminderInspect}
              >
                {busy === 'study-reminder-inspect' ? '判定中…' : '判定のみ'}
              </button>
              <button
                type="button"
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
                disabled={!targetId || busy !== null}
                onClick={runStudyReminderSend}
              >
                {busy === 'study-reminder-send'
                  ? '送信中…'
                  : 'このテストアカウントで学習リマインダーを実経路テスト'}
              </button>
            </div>

            {studyInspect && (
              <dl className="mt-4 space-y-2 text-sm text-foreground" aria-live="polite">
                <div className="font-medium">想定結果：{studyInspect.projectedOutcomeLabel}</div>
                <div>本日の日付（JST）: {studyInspect.dateKey}</div>
                <div>本日の学習記録: {studyInspect.recordedToday ? 'あり' : 'なし'}</div>
                <div>
                  管理者設定:{' '}
                  {studyInspect.preferenceEnabled ? '有効' : '停止中'}
                  {studyInspect.preferenceRowExists ? '' : '（設定行なし＝既定ON）'}
                </div>
                <div>
                  有効Push購読: {studyInspect.hasActivePushSubscription ? 'あり' : 'なし'}
                </div>
                <div>メールfallback: {studyInspect.canEmailFallback ? '可能' : '不可'}</div>
                <div>Push送信機能: {studyInspect.pushSendingEnabled ? 'ON' : 'OFF'}</div>
                <div>現在の学習リマインダー実効モード: {studyInspect.deliveryMode}</div>
                <p className="text-xs text-muted">判定のみでは送信・event／delivery作成は行いません。</p>
              </dl>
            )}
          </section>

          <section
            className="rounded-2xl border border-border bg-card p-5 shadow-sm"
            aria-labelledby={`${baseId}-coaching-path-heading`}
          >
            <h2 id={`${baseId}-coaching-path-heading`} className="text-base font-bold text-foreground">
              コーチング通知 実経路テスト
            </h2>
            <p className="mt-2 text-sm text-muted">
              通常Cronを起動せず、選択したテストアカウント1人だけを現在のコーチング通知経路で判定・送信します。
              通常の冪等性キーは使いません。
            </p>

            <div className="mt-5 border-t border-border pt-4">
              <h3 className="text-sm font-bold text-foreground">今週のコーチング予約催促</h3>
              <p className="mt-1 text-xs text-muted">
                固定文面: 受験生web / 今週のコーチングを予約してください。 / /dashboard/coaching
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-card disabled:opacity-60"
                  disabled={!targetId || busy !== null}
                  onClick={runCoachingBookingInspect}
                >
                  {busy === 'coaching-booking-inspect' ? '判定中…' : '判定のみ'}
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
                  disabled={!targetId || busy !== null}
                  onClick={runCoachingBookingSend}
                >
                  {busy === 'coaching-booking-send' ? '送信中…' : '予約催促を実経路テスト'}
                </button>
              </div>
              {coachingBookingInspect && (
                <dl className="mt-4 space-y-2 text-sm text-foreground" aria-live="polite">
                  <div className="font-medium">
                    想定結果：{coachingBookingInspect.projectedOutcomeLabel}
                  </div>
                  <div>対象週（JST）: {coachingBookingInspect.weekLabel}</div>
                  <div>生徒として有効: {coachingBookingInspect.isStudent ? 'はい' : 'いいえ'}</div>
                  <div>
                    既卒除外: {coachingBookingInspect.graduateExcluded ? '該当' : '非該当'}
                  </div>
                  <div>
                    今週のコーチング予約:{' '}
                    {coachingBookingInspect.hasBookingThisWeek ? 'あり' : 'なし'}
                  </div>
                  <div>
                    管理者通知設定:{' '}
                    {coachingBookingInspect.preferenceEnabled ? '有効' : '停止中'}
                  </div>
                  <div>
                    有効Push購読:{' '}
                    {coachingBookingInspect.hasActivePushSubscription ? 'あり' : 'なし'}
                  </div>
                  <div>
                    メールfallback:{' '}
                    {coachingBookingInspect.canEmailFallback ? '可能' : '不可'}
                  </div>
                  <p className="text-xs text-muted">
                    判定のみでは送信・チャット作成・event作成は行いません。実送信時はチャットに催促が追加される場合があります。
                  </p>
                </dl>
              )}
            </div>

            <div className="mt-5 border-t border-border pt-4">
              <h3 className="text-sm font-bold text-foreground">コーチング前日の時刻通知</h3>
              <p className="mt-1 text-xs text-muted">
                固定文面: 受験生web / 明日HH:mmからコーチングです。 / /dashboard/coaching
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-card disabled:opacity-60"
                  disabled={!targetId || busy !== null}
                  onClick={runCoachingSessionInspect}
                >
                  {busy === 'coaching-session-inspect' ? '判定中…' : '判定のみ'}
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
                  disabled={!targetId || busy !== null}
                  onClick={runCoachingSessionSend}
                >
                  {busy === 'coaching-session-send' ? '送信中…' : '前日案内を実経路テスト'}
                </button>
              </div>
              {coachingSessionInspect && (
                <dl className="mt-4 space-y-2 text-sm text-foreground" aria-live="polite">
                  <div className="font-medium">
                    想定結果：{coachingSessionInspect.projectedOutcomeLabel}
                  </div>
                  <div>明日の日付（JST）: {coachingSessionInspect.tomorrowKey}</div>
                  <div>明日のscheduled予約件数: {coachingSessionInspect.scheduledCount}</div>
                  <div>
                    予約開始時刻:{' '}
                    {coachingSessionInspect.startTimes.length > 0
                      ? coachingSessionInspect.startTimes.join(' / ')
                      : 'なし'}
                  </div>
                  {coachingSessionInspect.bookings.length > 0 && (
                    <div>
                      キャンセル状態:{' '}
                      {coachingSessionInspect.bookings
                        .map((b) => `${b.startTimeHm}=${b.status}`)
                        .join(' / ')}
                    </div>
                  )}
                  <div>
                    管理者通知設定:{' '}
                    {coachingSessionInspect.preferenceEnabled ? '有効' : '停止中'}
                  </div>
                  <div>
                    有効Push購読:{' '}
                    {coachingSessionInspect.hasActivePushSubscription ? 'あり' : 'なし'}
                  </div>
                  <div>
                    メールfallback:{' '}
                    {coachingSessionInspect.canEmailFallback ? '可能' : '不可'}
                  </div>
                  <p className="text-xs text-muted">
                    判定のみでは送信・event作成は行いません。予約の作成・変更はしません。
                  </p>
                </dl>
              )}
            </div>
          </section>

          <section
            className="rounded-2xl border border-border bg-card p-5 shadow-sm"
            aria-labelledby={`${baseId}-inspect-heading`}
          >
            <h2 id={`${baseId}-inspect-heading`} className="text-base font-bold text-foreground">
              状態確認（固定文面テスト用・送信なし）
            </h2>
            <p className="mt-2 text-sm text-muted">
              下の固定文面テスト向けの簡易確認です。学習記録リマインダー実経路は上のセクションを使ってください。
            </p>
            <button
              type="button"
              className="mt-4 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-card disabled:opacity-60"
              disabled={!targetId || busy !== null}
              onClick={() => runSendAction('inspect')}
            >
              {busy === 'inspect' ? '確認中…' : '簡易判定を実行'}
            </button>

            {inspect && (
              <dl className="mt-4 space-y-2 text-sm text-foreground" aria-live="polite">
                <div className="font-medium">{inspect.projectedOutcomeLabel}</div>
                <div>本日の学習記録: {inspect.recordedToday ? 'あり' : 'なし'}</div>
                <div>
                  学習リマインダー設定:{' '}
                  {inspect.preferenceEnabled ? 'ON' : 'OFF'}
                  {inspect.preferenceRowExists ? '' : '（設定行なし＝既定ON）'}
                </div>
                <div>有効なPush購読: {inspect.hasActivePushSubscription ? 'あり' : 'なし'}</div>
                <div>メールfallback: {inspect.canEmailFallback ? '可能' : '不可'}</div>
                <div>Push送信機能: {inspect.pushSendingEnabled ? 'ON' : 'OFF'}</div>
                <div>通常配信モード: {inspect.deliveryMode}</div>
              </dl>
            )}
          </section>

          <section
            className="rounded-2xl border border-primary/20 bg-primary/5 p-5 shadow-sm"
            aria-labelledby={`${baseId}-send-heading`}
          >
            <h2 id={`${baseId}-send-heading`} className="text-base font-bold text-foreground">
              実送信テスト
            </h2>
            <p className="mt-2 text-sm text-muted">
              外部通知が実際に1件送られます。Pushとメールは同時送信しません。一般生徒には送られません。
              notification type は test で、本番カテゴリのeventとは分離されます。お知らせ・メッセージ・予約は作成しません。
            </p>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
                disabled={!targetId || busy !== null}
                onClick={() =>
                  runSendAction(
                    'push',
                    [
                      `「${ADMIN_CATEGORY_TEST_FIXTURES[category].label}」のテストPushを1件送信します。`,
                      selectedLabel ? `対象表示名: ${selectedLabel}` : '',
                      '一般生徒には送られません。よろしいですか？',
                    ]
                      .filter(Boolean)
                      .join('\n'),
                  )
                }
              >
                {busy === 'push' ? '送信中…' : 'Pushテストを送る'}
              </button>

              <button
                type="button"
                className="rounded-xl border border-primary/40 bg-background px-4 py-2.5 text-sm font-medium text-primary transition hover:bg-primary/10 disabled:opacity-60"
                disabled={!targetId || busy !== null}
                onClick={() =>
                  runSendAction(
                    'email',
                    [
                      `「${ADMIN_CATEGORY_TEST_FIXTURES[category].label}」のテストメールを1件送信します。`,
                      selectedLabel ? `対象表示名: ${selectedLabel}` : '',
                      '一般生徒には送られません。よろしいですか？',
                    ]
                      .filter(Boolean)
                      .join('\n'),
                  )
                }
              >
                {busy === 'email' ? '送信中…' : 'メールテストを送る'}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
