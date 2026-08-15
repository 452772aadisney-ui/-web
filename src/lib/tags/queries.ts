import { createClient } from '@/lib/supabase/server'
import type { StudentTag } from '@/types/tag'

export async function fetchStudentTags(): Promise<StudentTag[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('student_tags')
    .select('*')
    .order('category')
    .order('name')
  return (data as StudentTag[]) ?? []
}

export async function fetchTagIdsForProfile(profileId: string): Promise<string[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('profile_student_tags')
    .select('tag_id')
    .eq('profile_id', profileId)
  return (data ?? []).map((row) => row.tag_id as string)
}

export async function fetchTagsForProfile(profileId: string): Promise<StudentTag[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('profile_student_tags')
    .select('tag_id, student_tags(*)')
    .eq('profile_id', profileId)

  if (!data) return []

  return data
    .map((row) => {
      const tag = row.student_tags
      if (!tag || Array.isArray(tag)) return null
      return tag as StudentTag
    })
    .filter((tag): tag is StudentTag => tag !== null)
}

export async function fetchAllProfileTagAssignments(): Promise<
  Array<{ profile_id: string; tag_id: string }>
> {
  const supabase = await createClient()
  const { data } = await supabase.from('profile_student_tags').select('profile_id, tag_id')
  return data ?? []
}

export async function fetchGradeTagNamesByStudentId(): Promise<Map<string, string>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('profile_student_tags')
    .select('profile_id, student_tags(category, name)')

  const map = new Map<string, string>()

  for (const row of data ?? []) {
    const rawTag = row.student_tags
    if (!rawTag || Array.isArray(rawTag)) continue
    const tag = rawTag as Pick<StudentTag, 'category' | 'name'>
    if (tag.category !== '学年') continue
    if (!map.has(row.profile_id)) {
      map.set(row.profile_id, tag.name)
    }
  }

  return map
}

export async function fetchGradeTagNameForProfile(profileId: string): Promise<string | null> {
  const tags = await fetchTagsForProfile(profileId)
  return tags.find((tag) => tag.category === '学年')?.name ?? null
}

export async function resolveGradeTagId(gradeTagName: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('student_tags')
    .select('id')
    .eq('category', '学年')
    .eq('name', gradeTagName)
    .maybeSingle()

  return data?.id ?? null
}
