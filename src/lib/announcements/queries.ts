import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Announcement, AnnouncementRead, AnnouncementWithTargets } from '@/types/announcement'

function normalizeAnnouncement(row: Announcement): Announcement {
  return {
    ...row,
    target_all: row.target_all ?? false,
  }
}

async function attachTargets(
  announcements: Announcement[],
): Promise<AnnouncementWithTargets[]> {
  if (announcements.length === 0) return []

  const supabase = await createClient()
  const ids = announcements.map((a) => a.id)

  const [
    { data: tagRows, error: tagError },
    { data: studentRows, error: studentError },
  ] = await Promise.all([
    supabase.from('announcement_target_tags').select('announcement_id, tag_id').in('announcement_id', ids),
    supabase
      .from('announcement_target_students')
      .select('announcement_id, student_id')
      .in('announcement_id', ids),
  ])

  if (tagError) {
    console.error('[announcements] target tags query failed:', tagError.message)
  }
  if (studentError) {
    console.error('[announcements] target students query failed:', studentError.message)
  }

  const tagsByAnnouncement = new Map<string, string[]>()
  const studentsByAnnouncement = new Map<string, string[]>()

  for (const row of tagRows ?? []) {
    const list = tagsByAnnouncement.get(row.announcement_id) ?? []
    list.push(row.tag_id as string)
    tagsByAnnouncement.set(row.announcement_id as string, list)
  }

  for (const row of studentRows ?? []) {
    const list = studentsByAnnouncement.get(row.announcement_id) ?? []
    list.push(row.student_id as string)
    studentsByAnnouncement.set(row.announcement_id as string, list)
  }

  return announcements.map((a) => ({
    ...a,
    target_tag_ids: tagsByAnnouncement.get(a.id) ?? [],
    target_student_ids: studentsByAnnouncement.get(a.id) ?? [],
  }))
}

async function fetchAnnouncementsForCurrentUser(): Promise<Announcement[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[announcements] fetch failed:', error.message)
    return []
  }

  return ((data as Announcement[]) ?? []).map(normalizeAnnouncement)
}

export async function fetchAnnouncements(): Promise<AnnouncementWithTargets[]> {
  const announcements = await fetchAnnouncementsForCurrentUser()
  return attachTargets(announcements)
}

export async function fetchAnnouncementsForStudent(
  _studentId: string,
): Promise<Announcement[]> {
  return fetchAnnouncementsForCurrentUser()
}

export async function fetchAnnouncementById(id: string): Promise<Announcement | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('[announcements] fetch by id failed:', error.message)
    return null
  }

  if (!data) return null
  return normalizeAnnouncement(data as Announcement)
}

export async function fetchAnnouncementReadsForStudent(
  studentId: string,
): Promise<AnnouncementRead[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('announcement_reads')
    .select('*')
    .eq('student_id', studentId)

  if (error) {
    console.error('[announcements] reads query failed:', error.message)
    return []
  }

  return (data as AnnouncementRead[]) ?? []
}

export async function fetchAllAnnouncementReads(): Promise<AnnouncementRead[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('announcement_reads').select('*')

  if (error) {
    console.error('[announcements] all reads query failed:', error.message)
    return []
  }

  return (data as AnnouncementRead[]) ?? []
}

export const fetchUnreadAnnouncementCount = cache(async (studentId: string): Promise<number> => {
  try {
    const [announcements, reads] = await Promise.all([
      fetchAnnouncementsForStudent(studentId),
      fetchAnnouncementReadsForStudent(studentId),
    ])
    const readIds = new Set(reads.map((r) => r.announcement_id))
    return announcements.filter((a) => !readIds.has(a.id)).length
  } catch (error) {
    console.error('[announcements] unread count failed:', error)
    return 0
  }
})
