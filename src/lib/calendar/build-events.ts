import type { CalendarEvent } from '@/lib/calendar/events'
import { formatCoachingSlotDateTime } from '@/lib/coaching/format'
import type { CoachingBookingWithDetails } from '@/types/coaching'
import type { ExamSchedule, HomeworkTask } from '@/types/schedule'
import type { Textbook } from '@/types/textbook'

export function buildCalendarEvents(
  exams: ExamSchedule[],
  homework: HomeworkTask[],
  textbooks: Textbook[],
): CalendarEvent[] {
  const events: CalendarEvent[] = []

  for (const exam of exams) {
    events.push({
      id: `exam-${exam.id}`,
      date: exam.scheduled_on,
      type: exam.exam_type,
      title: exam.title,
      subject: exam.subject || undefined,
      detail: exam.exam_type === 'mock_exam' ? '受験日' : exam.note || undefined,
    })

    if (exam.exam_type === 'mock_exam' && exam.return_on) {
      events.push({
        id: `exam-return-${exam.id}`,
        date: exam.return_on,
        type: 'mock_exam_return',
        title: exam.title,
        subject: exam.subject || undefined,
        detail: '返却日',
      })
    }
  }

  for (const task of homework) {
    events.push({
      id: `hw-${task.id}`,
      date: task.due_date,
      type: 'homework',
      title: task.title,
      subject: task.subject,
      detail: task.description || undefined,
    })
  }

  for (const book of textbooks) {
    if (book.start_date) {
      events.push({
        id: `tb-start-${book.id}`,
        date: book.start_date,
        type: 'textbook_start',
        title: book.name,
        subject: book.subjects.join('・'),
        detail: '参考書の学習開始日',
      })
    }
    if (book.planned_end_date) {
      events.push({
        id: `tb-end-${book.id}`,
        date: book.planned_end_date,
        type: 'textbook_end',
        title: book.name,
        subject: book.subjects.join('・'),
        detail: '参考書の終了予定日',
      })
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date))
}

export function buildCoachingCalendarEvents(
  bookings: CoachingBookingWithDetails[],
): CalendarEvent[] {
  return bookings
    .filter((booking) => booking.status !== 'cancelled')
    .map((booking) => {
      const slotDate = booking.slot.slot_date ?? booking.slot.starts_at.slice(0, 10)
      const startTime = booking.slot.start_time?.slice(0, 5)

      return {
        id: `coaching-${booking.id}`,
        date: slotDate,
        type: 'coaching' as const,
        title: `コーチング（${booking.coach.name}）`,
        detail:
          slotDate && startTime
            ? formatCoachingSlotDateTime(slotDate, startTime).replace(/^[^\s]+\s/, '')
            : undefined,
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}
