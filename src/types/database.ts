export type UserRole = 'student' | 'admin'

export interface Profile {
  id: string
  email: string
  full_name: string
  display_name: string
  birthday: string | null
  target_schools: string[]
  subjects: string[]
  student_code: string | null
  role: UserRole
  admin_since: string | null
  faq_intro_seen_at: string | null
  created_at: string
  updated_at: string
}

export interface ProfileFormData {
  full_name: string
  display_name: string
  birthday: string
  target_schools: string[]
  subjects: string[]
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: {
          id: string
          email: string
          full_name?: string
          display_name?: string
          birthday?: string | null
          target_schools?: string[]
          subjects?: string[]
          student_code?: string | null
          role?: UserRole
          admin_since?: string | null
          faq_intro_seen_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          email?: string
          full_name?: string
          display_name?: string
          birthday?: string | null
          target_schools?: string[]
          subjects?: string[]
          student_code?: string | null
          role?: UserRole
          admin_since?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      user_role: UserRole
    }
    CompositeTypes: Record<string, never>
  }
}
