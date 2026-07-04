export interface Textbook {
  id: string
  student_id: string
  name: string
  subjects: string[]
  start_date: string | null
  planned_end_date: string | null
  created_at: string
  updated_at: string
}
