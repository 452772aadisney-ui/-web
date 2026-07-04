export interface StudentTag {
  id: string
  category: string
  name: string
  created_at: string
}

export interface ProfileStudentTag {
  profile_id: string
  tag_id: string
  assigned_at: string
}
