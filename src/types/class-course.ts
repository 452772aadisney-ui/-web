import type {
  ClassCourseSubject,
  ClassCourseTerm,
  ClassCourseTrack,
} from '@/lib/class-course/catalog'

export type ClassCourseUnit = {
  id: string
  academic_year: number
  term: ClassCourseTerm
  subject: ClassCourseSubject
  track: ClassCourseTrack
  seq_no: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export type ClassCourseAssignmentStatus = 'active' | 'cancelled'

export type ClassCourseAssignment = {
  id: string
  course_unit_id: string
  student_id: string
  status: ClassCourseAssignmentStatus
  cancelled_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type ClassScheduleAudienceType = 'all_kisotsu' | 'targeted'

export type ClassCourseAttendanceStatus = 'not_done' | 'attended' | 'absent'

export type ClassCourseAttendanceEvent = {
  id: string
  course_unit_id: string
  student_id: string
  assignment_id: string | null
  status: ClassCourseAttendanceStatus
  event_date: string
  session_id: string | null
  note: string | null
  recorded_by: string | null
  recorded_at: string
}

export type ClassCourseRemainingSummary = {
  academic_year: number
  term: ClassCourseTerm
  subject: ClassCourseSubject
  track: ClassCourseTrack
  assignedCount: number
  attendedCount: number
  remainingCount: number
}
