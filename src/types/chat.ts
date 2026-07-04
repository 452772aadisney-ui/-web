export interface ChatMessage {
  id: string
  student_id: string
  sender_id: string
  body: string
  created_at: string
}

export interface ChatParticipant {
  id: string
  display_name: string
  full_name: string
  role: 'student' | 'admin'
}
