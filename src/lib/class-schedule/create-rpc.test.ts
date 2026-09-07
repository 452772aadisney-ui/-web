import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  CREATE_CLASS_SCHEDULE_RPC_ARG_KEYS,
  CREATE_CLASS_SCHEDULE_RPC_NAME,
  buildCreateClassScheduleRpcArgs,
  classifyClassScheduleRpcError,
  createClassScheduleRpcArgKeyCount,
  createClassScheduleRpcDiagnostic,
  mapClassScheduleDbError,
} from '@/lib/class-schedule/create-rpc'
import { parseDayFields, parseSessionDraft } from '@/lib/class-schedule/validation'
import { EXAM_SUBJECTS } from '@/lib/constants/subjects'

function readMigration(name: string): string {
  return readFileSync(
    join(process.cwd(), 'supabase', 'migrations', name),
    'utf8',
  )
}

function extractCreateRpcParamNamesForLocationDetails(sql: string): string[] {
  const matches = [
    ...sql.matchAll(
      /create or replace function public\.create_class_schedule_day_with_sessions\(\s*([\s\S]*?)\)\s*returns table/gi,
    ),
  ]
  const fiveArg = matches.find((m) => m[1].includes('p_location_details'))
  if (!fiveArg) return []
  return [...fiveArg[1].matchAll(/\b(p_[a-z_]+)\s+/g)].map((m) => m[1])
}

describe('create class schedule RPC arg alignment', () => {
  it('keeps app RPC name identical to migration 057 5-arg function', () => {
    const sql = readMigration('057_class_schedule_location_details.sql')
    expect(sql).toContain(
      `create or replace function public.${CREATE_CLASS_SCHEDULE_RPC_NAME}(`,
    )
    expect(sql).toMatch(/p_location_details text/)
  })

  it('matches 057 5-arg parameter names exactly (order and keys)', () => {
    const from057 = extractCreateRpcParamNamesForLocationDetails(
      readMigration('057_class_schedule_location_details.sql'),
    )
    expect(from057).toEqual([...CREATE_CLASS_SCHEDULE_RPC_ARG_KEYS])
  })

  it('builds all 5 named keys including null optional location_details', () => {
    const day = parseDayFields({
      schedule_date: '2026-09-10',
      venue_name: '会場A',
      location_details: '  ',
    })
    expect(day.ok).toBe(true)
    if (!day.ok) return

    const session = parseSessionDraft({
      start_time: '10:00',
      end_time: '11:30',
      subject: EXAM_SUBJECTS[0],
      note: '',
    })
    expect(session.ok).toBe(true)
    if (!session.ok) return

    const args = buildCreateClassScheduleRpcArgs({
      ...day.day,
      sessions: [session.session],
      actorId: '00000000-0000-4000-8000-000000000001',
    })

    expect(createClassScheduleRpcArgKeyCount(args)).toBe(5)
    expect(Object.keys(args)).toEqual([...CREATE_CLASS_SCHEDULE_RPC_ARG_KEYS])
    expect(args.p_location_details).toBeNull()
    expect(args.p_sessions).toHaveLength(1)
    expect(args.p_sessions[0]).toEqual({
      start_time: '10:00',
      end_time: '11:30',
      subject: EXAM_SUBJECTS[0],
      note: null,
    })
  })

  it('supports multiple sessions with stable JSON keys', () => {
    const sessions = ['10:00', '12:00'].map((start, index) => {
      const parsed = parseSessionDraft({
        start_time: start,
        end_time: index === 0 ? '11:00' : '13:00',
        subject: EXAM_SUBJECTS[index % EXAM_SUBJECTS.length],
        note: index === 0 ? null : '補足',
      })
      expect(parsed.ok).toBe(true)
      if (!parsed.ok) throw new Error('session parse failed')
      return parsed.session
    })

    const args = buildCreateClassScheduleRpcArgs({
      schedule_date: '2026-09-11',
      venue_name: '会場B',
      location_details: '東京都\nhttps://maps.example.com/x\n3F',
      sessions,
      actorId: '00000000-0000-4000-8000-000000000002',
    })

    expect(args.p_location_details).toContain('東京都')
    expect(args.p_sessions).toHaveLength(2)
    expect(args.p_sessions.every((s) => 'start_time' in s && 'end_time' in s)).toBe(
      true,
    )
    expect(args.p_sessions.every((s) => 'subject' in s && 'note' in s)).toBe(true)
  })
})

describe('classifyClassScheduleRpcError', () => {
  it('maps PostgREST missing RPC / schema cache to rpc_not_found', () => {
    expect(
      classifyClassScheduleRpcError({
        code: 'PGRST202',
        message: 'Could not find the function public.create_class_schedule_day_with_sessions',
        hint: 'try reloading the schema cache',
      }),
    ).toBe('rpc_not_found')
  })

  it('maps permission failures without exposing internals in UI copy', () => {
    expect(
      classifyClassScheduleRpcError({
        code: '42501',
        message: 'permission denied: service_role only',
      }),
    ).toBe('permission_denied')
    expect(
      mapClassScheduleDbError({
        code: '42501',
        message: 'permission denied: admin actor required',
      }),
    ).toBe('管理者権限が必要です')
  })

  it('maps PostgreSQL 42702 to ambiguous_column with generic UI copy', () => {
    expect(
      classifyClassScheduleRpcError({
        code: '42702',
        message: 'column reference "notify_revision" is ambiguous',
      }),
    ).toBe('ambiguous_column')
    expect(
      mapClassScheduleDbError({
        code: '42702',
        message: 'column reference "notify_revision" is ambiguous',
      }),
    ).toBe('授業予定の保存に失敗しました')
  })

  it('keeps pre-diagnostic user-facing copy for 22023', () => {
    // Historical mapping treated any 22023 as session-count messaging.
    expect(
      mapClassScheduleDbError({
        code: '22023',
        message: 'invalid venue_name',
      }),
    ).toBe('コマを1つ以上追加してください')
    expect(
      mapClassScheduleDbError({
        code: '22023',
        message: 'at least one session is required',
      }),
    ).toBe('コマを1つ以上追加してください')
    expect(
      mapClassScheduleDbError({
        code: 'PGRST202',
        message: 'Could not find the function',
      }),
    ).toBe('授業予定の保存に失敗しました')
  })

  it('diagnostic payload stays free of PII and venue fields', () => {
    const diagnostic = createClassScheduleRpcDiagnostic({
      phase: 'create_rpc',
      error: {
        code: 'PGRST202',
        message: 'Could not find the function',
      },
      argKeyCount: 5,
      sessionCount: 1,
    })
    expect(diagnostic).toEqual({
      op: 'class_schedule_create',
      phase: 'create_rpc',
      errorClass: 'rpc_not_found',
      supabaseCode: 'PGRST202',
      argKeyCount: 5,
      sessionCount: 1,
      hasMessage: true,
    })
    expect(JSON.stringify(diagnostic)).not.toMatch(/@|https?:|venue|actor|uuid/i)
  })
})

describe('createClassScheduleDay service_role path', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('calls only the create RPC after admin gate (no partial table writes)', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ day_id: 'day-1', notify_revision: 1 }],
      error: null,
    })
    const from = vi.fn()
    const admin = { rpc, from }

    vi.doMock('@/lib/class-schedule/rpc-auth', async () => {
      const actual = await vi.importActual<
        typeof import('@/lib/class-schedule/rpc-auth')
      >('@/lib/class-schedule/rpc-auth')
      return {
        ...actual,
        requireAdminClassScheduleRpcClient: vi.fn().mockResolvedValue({
          ok: true,
          profile: { id: 'admin-1', role: 'admin' },
          admin,
        }),
      }
    })
    vi.doMock('@/lib/class-schedule/class-schedule-orchestrator', () => ({
      deliverClassScheduleNotifications: vi.fn().mockResolvedValue({
        ok: true,
        mode: 'legacy',
        forcedLegacyReason: null,
        recipients: 0,
        pushSucceeded: 0,
        emailFallbackSucceeded: 0,
        preferenceDisabled: 0,
        cannotDeliver: 0,
        failed: 0,
        legacyEmailRecipientCount: 0,
        legacyEmailSentCount: 0,
        emailUnprocessedCount: 0,
        stalePending: 0,
        timedOut: false,
        durationMs: 1,
        wouldUsePushFirst: 0,
        wouldFallbackToEmail: 0,
        alreadyCompleted: 0,
        inProgress: 0,
        emailFailed: 0,
        nonProductionSkip: 0,
      }),
      classScheduleNotifySuccessMessage: (saved: string) => saved,
    }))
    vi.doMock('@/lib/toast/flash-toast-server', () => ({
      setFlashToastCookie: vi.fn().mockResolvedValue(undefined),
    }))
    vi.doMock('next/cache', () => ({
      revalidatePath: vi.fn(),
    }))

    const { createClassScheduleDay } = await import('@/app/class-schedule/actions')
    const { setFlashToastCookie } = await import('@/lib/toast/flash-toast-server')

    const formData = new FormData()
    formData.set('scheduleDate', '2026-09-12')
    formData.set('venueName', '会場')
    formData.set('locationDetails', '')
    formData.append('sessionStartTime', '10:00')
    formData.append('sessionEndTime', '11:00')
    formData.append('sessionSubject', EXAM_SUBJECTS[0])
    formData.append('sessionNote', '')

    const result = await createClassScheduleDay({}, formData)

    expect(result.success).toBe(true)
    expect(setFlashToastCookie).toHaveBeenCalledWith('class_schedule_created')
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith(
      CREATE_CLASS_SCHEDULE_RPC_NAME,
      expect.objectContaining({
        p_schedule_date: '2026-09-12',
        p_venue_name: '会場',
        p_location_details: null,
        p_actor_id: 'admin-1',
        p_sessions: [
          {
            start_time: '10:00',
            end_time: '11:00',
            subject: EXAM_SUBJECTS[0],
            note: null,
          },
        ],
      }),
    )
    expect(from).not.toHaveBeenCalled()
  })

  it('rejects non-admin before any RPC and leaves no writes', async () => {
    const rpc = vi.fn()
    vi.doMock('@/lib/class-schedule/rpc-auth', async () => {
      const actual = await vi.importActual<
        typeof import('@/lib/class-schedule/rpc-auth')
      >('@/lib/class-schedule/rpc-auth')
      return {
        ...actual,
        requireAdminClassScheduleRpcClient: vi.fn().mockResolvedValue({
          ok: false,
          error: '管理者権限が必要です',
        }),
      }
    })
    vi.doMock('next/cache', () => ({
      revalidatePath: vi.fn(),
    }))

    const { createClassScheduleDay } = await import('@/app/class-schedule/actions')
    const formData = new FormData()
    formData.set('scheduleDate', '2026-09-12')
    formData.set('venueName', '会場')
    formData.append('sessionStartTime', '10:00')
    formData.append('sessionEndTime', '11:00')
    formData.append('sessionSubject', EXAM_SUBJECTS[0])
    formData.append('sessionNote', '')

    const result = await createClassScheduleDay({}, formData)
    expect(result).toEqual({ error: '管理者権限が必要です' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('on RPC failure returns mapped error without table fallback writes', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function in the schema cache',
      },
    })
    const from = vi.fn()
    const admin = { rpc, from }

    vi.doMock('@/lib/class-schedule/rpc-auth', async () => {
      const actual = await vi.importActual<
        typeof import('@/lib/class-schedule/rpc-auth')
      >('@/lib/class-schedule/rpc-auth')
      return {
        ...actual,
        requireAdminClassScheduleRpcClient: vi.fn().mockResolvedValue({
          ok: true,
          profile: { id: 'admin-1', role: 'admin' },
          admin,
        }),
      }
    })
    vi.doMock('@/lib/toast/flash-toast-server', () => ({
      setFlashToastCookie: vi.fn().mockResolvedValue(undefined),
    }))
    vi.doMock('next/cache', () => ({
      revalidatePath: vi.fn(),
    }))

    const { createClassScheduleDay } = await import('@/app/class-schedule/actions')
    const { setFlashToastCookie } = await import('@/lib/toast/flash-toast-server')
    const formData = new FormData()
    formData.set('scheduleDate', '2026-09-13')
    formData.set('venueName', '会場')
    formData.append('sessionStartTime', '10:00')
    formData.append('sessionEndTime', '11:00')
    formData.append('sessionSubject', EXAM_SUBJECTS[0])
    formData.append('sessionNote', '')

    const result = await createClassScheduleDay({}, formData)
    expect(result.error).toBe('授業予定の保存に失敗しました')
    expect(from).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(setFlashToastCookie).not.toHaveBeenCalled()
  })
})

describe('migration RPC auth gates (service_role + admin actor)', () => {
  it('requires service_role and admin p_actor_id in 055 body', () => {
    const sql = readMigration('055_repair_class_schedule_partial_migration.sql')
    expect(sql).toMatch(/auth\.role\(\) is distinct from 'service_role'/)
    expect(sql).toMatch(/p\.id = p_actor_id/)
    expect(sql).toMatch(/p\.role = 'admin'/)
    expect(sql).toMatch(
      /grant execute on function public\.create_class_schedule_day_with_sessions\([\s\S]*?\) to service_role/i,
    )
    expect(sql).toMatch(
      /revoke all on function public\.create_class_schedule_day_with_sessions\([\s\S]*?\) from authenticated/i,
    )
  })
})
