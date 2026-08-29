export type TextbookCatalogVisibility = 'public' | 'private'

export interface TextbookCatalog {
  id: string
  name: string
  subjects: string[]
  usage_tags: string[]
  detail_tags: string[]
  cover_url: string | null
  publisher: string | null
  target_universities: string[]
  study_purposes: string[]
  visibility: TextbookCatalogVisibility
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface TextbookCatalogUsage {
  catalog_id: string
  student_id: string
  student_name: string
}

export interface TextbookUser {
  student_id: string
  student_name: string
}

export interface TextbookCatalogWithUsers extends TextbookCatalog {
  users: TextbookUser[]
  textbookIdsByStudent: Record<string, string>
  isManagedCatalog: boolean
}

export interface AdminBookshelfStudentEntry {
  key: string
  name: string
  subjects: string[]
  detail_tags: string[]
  usage_tags: string[]
  users: TextbookUser[]
  textbookIdsByStudent: Record<string, string>
}

export interface AdminBookshelfOverview {
  catalog: TextbookCatalogWithUsers[]
  studentEntries: AdminBookshelfStudentEntry[]
}

export interface Textbook {
  id: string
  student_id: string
  name: string
  subjects: string[]
  usage_tags: string[]
  detail_tags: string[]
  cover_url: string | null
  publisher: string | null
  start_date: string | null
  planned_end_date: string | null
  catalog_id: string | null
  registered_by: string | null
  is_seen_by_student: boolean
  created_at: string
  updated_at: string
}
