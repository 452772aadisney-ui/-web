'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/class-schedule/access'
import { requireAdminClassScheduleRpcClient } from '@/lib/class-schedule/rpc-auth'
import {
  CLASS_COURSE_SUBJECTS,
  CLASS_COURSE_TERMS,
  CLASS_COURSE_TRACKS,
  buildClassCourseDisplayName,
  type ClassCourseSubject,
  type ClassCourseTerm,
  type ClassCourseTrack,
} from '@/lib/class-course/catalog'
import {
  buildClassCourseRegistrationPopup,
  planClassCourseSeqRange,
  type ClassCourseNumberingMode,
} from '@/lib/class-course/numbering'
import { isKisotsuGradeTag } from '@/lib/tags/grade-order'
import { fetchGradeTagNamesByStudentId } from '@/lib/tags/queries'
import { fetchStudentList } from '@/lib/study/queries'

function parseTerm(raw: FormDataEntryValue | null): ClassCourseTerm | null {
  const v = String(raw ?? '')
  return (CLASS_COURSE_TERMS as readonly string[]).includes(v)
    ? (v as ClassCourseTerm)
    : null
}

function parseSubject(raw: FormDataEntryValue | null): ClassCourseSubject | null {
  const v = String(raw ?? '')
  return (CLASS_COURSE_SUBJECTS as readonly string[]).includes(v)
    ? (v as ClassCourseSubject)
    : null
}

function parseTrack(raw: FormDataEntryValue | null): ClassCourseTrack {
  const v = String(raw ?? 'regular')
  return (CLASS_COURSE_TRACKS as readonly string[]).includes(v)
    ? (v as ClassCourseTrack)
    : 'regular'
}

async function filterKisotsuStudentIds(studentIds: string[]): Promise<string[]> {
  if (studentIds.length === 0) return []
  const gradeMap = await fetchGradeTagNamesByStudentId()
  return studentIds.filter((id) => isKisotsuGradeTag(gradeMap.get(id) ?? null))
}

export type CreateCoursesResult =
  | {
      ok: true
      popupTitle: string
      popupBody: string
      unitIds: string[]
    }
  | { ok: false; error: string }

export async function createClassCoursesWithAssignments(
  formData: FormData,
): Promise<CreateCoursesResult> {
  const gate = await requireAdminClassScheduleRpcClient()
  if (!gate.ok) return { ok: false, error: gate.error }

  const academicYear = Number(formData.get('academicYear'))
  const term = parseTerm(formData.get('term'))
  const subject = parseSubject(formData.get('subject'))
  const track = parseTrack(formData.get('track'))
  const modeRaw = String(formData.get('numberingMode') ?? 'append')
  const mode: ClassCourseNumberingMode =
    modeRaw === 'custom' ? 'custom' : 'append'
  const count = Number(formData.get('count'))
  const startSeqRaw = formData.get('startSeq')
  const startSeq =
    startSeqRaw != null && String(startSeqRaw).trim() !== ''
      ? Number(startSeqRaw)
      : undefined
  const studentIds = formData.getAll('studentIds').map(String).filter(Boolean)

  if (!Number.isInteger(academicYear) || academicYear < 2000) {
    return { ok: false, error: '年度を確認してください' }
  }
  if (!term || !subject) {
    return { ok: false, error: '時期と科目を選択してください' }
  }

  const kisotsuIds = await filterKisotsuStudentIds(studentIds)
  if (kisotsuIds.length === 0) {
    return { ok: false, error: '対象の既卒生を選択してください' }
  }

  const { data: existingRows, error: existingError } = await gate.admin
    .from('class_course_units')
    .select('seq_no')
    .eq('academic_year', academicYear)
    .eq('term', term)
    .eq('subject', subject)
    .eq('track', track)

  if (existingError) {
    console.error('[class-course] list seq failed', existingError.code)
    return { ok: false, error: '既存番号の取得に失敗しました' }
  }

  const existingSeqNumbers = (existingRows ?? []).map((r) => Number(r.seq_no))
  const plan = planClassCourseSeqRange({
    existingSeqNumbers,
    mode,
    startSeq,
    count,
  })
  if (!plan.ok) return { ok: false, error: plan.message }

  const { data, error } = await gate.admin.rpc(
    'create_class_course_units_with_assignments',
    {
      p_academic_year: academicYear,
      p_term: term,
      p_subject: subject,
      p_track: track,
      p_seq_numbers: plan.seqNumbers,
      p_student_ids: kisotsuIds,
      p_actor_id: gate.profile.id,
    },
  )

  if (error) {
    console.error('[class-course] create rpc failed', error.code)
    return {
      ok: false,
      error:
        error.message?.includes('seq conflict')
          ? '番号が衝突しました。再度お試しください'
          : '授業の登録に失敗しました',
    }
  }

  const popup = buildClassCourseRegistrationPopup({
    plan,
    term,
    track,
    subject,
  })
  const unitIds = Array.isArray((data as { unit_ids?: string[] } | null)?.unit_ids)
    ? ((data as { unit_ids: string[] }).unit_ids)
    : plan.seqNumbers.map(() => '')

  revalidatePath('/admin/class-schedule')
  revalidatePath('/admin/class-schedule/courses')
  return {
    ok: true,
    popupTitle: popup.title,
    popupBody: popup.body,
    unitIds,
  }
}

export async function addStudentsToExistingCourses(
  formData: FormData,
): Promise<{ ok: true; inserted: number; skipped: number } | { ok: false; error: string }> {
  const gate = await requireAdminClassScheduleRpcClient()
  if (!gate.ok) return { ok: false, error: gate.error }

  const unitIds = formData.getAll('unitIds').map(String).filter(Boolean)
  const studentIds = formData.getAll('studentIds').map(String).filter(Boolean)
  const kisotsuIds = await filterKisotsuStudentIds(studentIds)

  if (unitIds.length === 0) {
    return { ok: false, error: '授業を選択してください' }
  }
  if (kisotsuIds.length === 0) {
    return { ok: false, error: '対象の既卒生を選択してください' }
  }

  const { data, error } = await gate.admin.rpc('add_students_to_class_course_units', {
    p_unit_ids: unitIds,
    p_student_ids: kisotsuIds,
    p_actor_id: gate.profile.id,
  })

  if (error) {
    console.error('[class-course] add students rpc failed', error.code)
    return { ok: false, error: '生徒の追加に失敗しました' }
  }

  const inserted = Number((data as { inserted?: number } | null)?.inserted ?? 0)
  const skipped = Number(
    (data as { skipped_duplicate?: number } | null)?.skipped_duplicate ?? 0,
  )
  const reactivated = Number(
    (data as { reactivated?: number } | null)?.reactivated ?? 0,
  )

  revalidatePath('/admin/class-schedule')
  revalidatePath('/admin/class-schedule/courses')
  return { ok: true, inserted: inserted + reactivated, skipped }
}

export async function listKisotsuStudentsForCourseAdmin(): Promise<
  { id: string; label: string }[]
> {
  const access = await requireSuperAdmin()
  if (!access.ok) return []

  const students = await fetchStudentList()
  const gradeMap = await fetchGradeTagNamesByStudentId()
  return students
    .filter((s) => isKisotsuGradeTag(gradeMap.get(s.id) ?? null))
    .map((s) => ({
      id: s.id,
      label: s.full_name || s.display_name || s.email || s.id,
    }))
}

export async function listCourseUnitsForScope(params: {
  academicYear: number
  term: ClassCourseTerm
  subject: ClassCourseSubject
  track: ClassCourseTrack
}): Promise<
  | { ok: true; units: { id: string; seqNo: number; displayName: string }[] }
  | { ok: false; error: string }
> {
  const access = await requireSuperAdmin()
  if (!access.ok) return { ok: false, error: access.error }
  const admin = createAdminClient()
  if (!admin) return { ok: false, error: '読み込みに失敗しました' }

  const { data, error } = await admin
    .from('class_course_units')
    .select('id, seq_no, academic_year, term, subject, track')
    .eq('academic_year', params.academicYear)
    .eq('term', params.term)
    .eq('subject', params.subject)
    .eq('track', params.track)
    .order('seq_no', { ascending: true })

  if (error) {
    console.error('[class-course] list units failed', error.code)
    return { ok: false, error: '授業一覧の取得に失敗しました' }
  }

  const units = (data ?? [])
    .map((row) => ({
      id: String(row.id),
      seqNo: Number(row.seq_no),
      displayName: buildClassCourseDisplayName({
        subject: row.subject as ClassCourseSubject,
        term: row.term as ClassCourseTerm,
        track: row.track as ClassCourseTrack,
        seqNo: Number(row.seq_no),
      }),
    }))
    .sort((a, b) => a.seqNo - b.seqNo)

  return { ok: true, units }
}

/**
 * 割当済み生徒。
 * assignments は student_id / created_by の両方が profiles を参照するため、
 * 曖昧な `profiles(...)` embed は PostgREST エラーになる → 必ず student_id を明示する。
 */
export async function listAssignedStudentsForCourseUnit(
  courseUnitId: string,
): Promise<
  | { ok: true; students: { id: string; label: string }[] }
  | { ok: false; error: string }
> {
  const access = await requireSuperAdmin()
  if (!access.ok) return { ok: false, error: access.error }
  const admin = createAdminClient()
  if (!admin) return { ok: false, error: '読み込みに失敗しました' }
  if (!courseUnitId) return { ok: true, students: [] }

  const { data, error } = await admin
    .from('class_course_assignments')
    .select('student_id, profiles!student_id(full_name, display_name, email)')
    .eq('course_unit_id', courseUnitId)
    .eq('status', 'active')

  if (error) {
    console.error('[class-course] list assignees failed', error.code, error.message)
    return { ok: false, error: '割当生徒の取得に失敗しました' }
  }

  const students = (data ?? []).map((row) => {
    const profileRaw = row.profiles
    const profile = (
      Array.isArray(profileRaw) ? profileRaw[0] : profileRaw
    ) as {
      full_name?: string
      display_name?: string
      email?: string
    } | null
    return {
      id: String(row.student_id),
      label:
        profile?.full_name ||
        profile?.display_name ||
        profile?.email ||
        String(row.student_id),
    }
  })

  students.sort((a, b) => a.label.localeCompare(b.label, 'ja'))
  return { ok: true, students }
}

export async function getCourseUnitScope(courseUnitId: string): Promise<{
  academicYear: number
  term: ClassCourseTerm
  subject: ClassCourseSubject
  track: ClassCourseTrack
  seqNo: number
  displayName: string
} | null> {
  const access = await requireSuperAdmin()
  if (!access.ok || !courseUnitId) return null
  const admin = createAdminClient()
  if (!admin) return null
  const { data } = await admin
    .from('class_course_units')
    .select('academic_year, term, subject, track, seq_no')
    .eq('id', courseUnitId)
    .maybeSingle()
  if (!data) return null
  return {
    academicYear: Number(data.academic_year),
    term: data.term as ClassCourseTerm,
    subject: data.subject as ClassCourseSubject,
    track: data.track as ClassCourseTrack,
    seqNo: Number(data.seq_no),
    displayName: buildClassCourseDisplayName({
      subject: data.subject as ClassCourseSubject,
      term: data.term as ClassCourseTerm,
      track: data.track as ClassCourseTrack,
      seqNo: Number(data.seq_no),
    }),
  }
}

export async function cancelStudentCourseAssignment(formData: FormData): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const courseUnitId = String(formData.get('courseUnitId') ?? '').trim()
  const studentId = String(formData.get('studentId') ?? '').trim()
  if (!courseUnitId || !studentId) {
    return { ok: false, error: '対象が不正です' }
  }
  const { cancelClassCourseAssignment } = await import(
    '@/app/class-course/attendance-actions'
  )
  return cancelClassCourseAssignment({ courseUnitId, studentId })
}
