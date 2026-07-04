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
