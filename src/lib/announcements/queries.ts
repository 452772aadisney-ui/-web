import { createClient } from '@/lib/supabase/server'
import type { Announcement, AnnouncementRead, AnnouncementWithTargets } from '@/types/announcement'

async function attachTargets(
  announcements: Announcement[],
): Promise<AnnouncementWithTargets[]> {
  if (announcements.length === 0) return []

  const supabase = await createClient()
  const ids = announcements.map((a) => a.id)

  const [{ data: tagRows }, { data: studentRows }] = await Promise.all([
    supabase.from('announcement_target_tags').select('announcement_id, tag_id').in('announcement_id', ids),
    supabase
      .from('announcement_target_students')
      .select('announcement_id, student_id')
      .in('announcement_id', ids),
  ])

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
    target_all: a.target_all ?? false,
    target_tag_ids: tagsByAnnouncement.get(a.id) ?? [],
    target_student_ids: studentsByAnnouncement.get(a.id) ?? [],
  }))
}

export async function fetchAnnouncements(): Promise<AnnouncementWithTargets[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false })
  return attachTargets((data as Announcement[]) ?? [])
}

export async function fetchAnnouncementsForStudent(
  studentId: string,
): Promise<AnnouncementWithTargets[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false })

  return attachTargets((data as Announcement[]) ?? [])
}

export async function fetchAnnouncementById(
  id: string,
): Promise<AnnouncementWithTargets | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('announcements')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!data) return null
  const [withTargets] = await attachTargets([data as Announcement])
  return withTargets ?? null
}

export async function fetchAnnouncementReadsForStudent(
  studentId: string,
): Promise<AnnouncementRead[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('announcement_reads')
    .select('*')
    .eq('student_id', studentId)
  return (data as AnnouncementRead[]) ?? []
}

export async function fetchAllAnnouncementReads(): Promise<AnnouncementRead[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('announcement_reads').select('*')
  return (data as AnnouncementRead[]) ?? []
}

export async function fetchUnreadAnnouncementCount(studentId: string): Promise<number> {
  const [announcements, reads] = await Promise.all([
    fetchAnnouncementsForStudent(studentId),
    fetchAnnouncementReadsForStudent(studentId),
  ])

  const readIds = new Set(reads.map((r) => r.announcement_id))
  return announcements.filter((a) => !readIds.has(a.id)).length
}
