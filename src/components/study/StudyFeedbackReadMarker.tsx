'use client'

import { useEffect } from 'react'
import { markStudyFeedbackRead } from '@/app/study/feedback-actions'

interface StudyFeedbackReadMarkerProps {
  feedbackId: string
}

export function StudyFeedbackReadMarker({ feedbackId }: StudyFeedbackReadMarkerProps) {
  useEffect(() => {
    void markStudyFeedbackRead(feedbackId)
  }, [feedbackId])

  return null
}
