export interface Announcement {
  id: string
  title: string
  body: string
  created_by: string | null
  target_all: boolean
  created_at: string
  updated_at: string
}

export interface AnnouncementWithTargets extends Announcement {
  target_tag_ids: string[]
  target_student_ids: string[]
}

export interface AnnouncementRead {
  id: string
  student_id: string
  announcement_id: string
  read_at: string
}

export interface AnnouncementWithReadStatus extends Announcement {
  read: boolean
  read_at?: string
}
