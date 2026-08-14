export type TextbookCatalogVisibility = 'public' | 'private'

export interface TextbookCatalog {
  id: string
  name: string
  subjects: string[]
  usage_tags: string[]
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

export interface Textbook {
  id: string
  student_id: string
  name: string
  subjects: string[]
  usage_tags: string[]
  start_date: string | null
  planned_end_date: string | null
  catalog_id: string | null
  registered_by: string | null
  is_seen_by_student: boolean
  created_at: string
  updated_at: string
}
