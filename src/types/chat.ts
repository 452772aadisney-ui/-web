export type ChatMessageKind = 'user' | 'coaching_booking_reminder'

export interface ChatMessage {
  id: string
  student_id: string
  sender_id: string
  body: string
  created_at: string
  /** Present after migration 052; treat missing as 'user' for reads. */
  message_kind?: ChatMessageKind
}

export interface ChatParticipant {
  id: string
  display_name: string
  full_name: string
  role: 'student' | 'admin'
}
