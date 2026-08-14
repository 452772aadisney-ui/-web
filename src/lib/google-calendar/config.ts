import { google } from 'googleapis'

export function getGoogleCalendarId(): string | null {
  const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim()
  return calendarId || null
}

export function getGoogleCalendarClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim()
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n').trim()
  const calendarId = getGoogleCalendarId()

  if (!email || !privateKey || !calendarId) {
    return null
  }

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/calendar.events'],
  })

  return {
    calendar: google.calendar({ version: 'v3', auth }),
    calendarId,
  }
}
