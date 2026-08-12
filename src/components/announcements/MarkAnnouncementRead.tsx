'use client'

import { useEffect } from 'react'
import { markAnnouncementAsRead } from '@/app/announcements/actions'

export function MarkAnnouncementRead({ announcementId }: { announcementId: string }) {
  useEffect(() => {
    void markAnnouncementAsRead(announcementId)
  }, [announcementId])

  return null
}
