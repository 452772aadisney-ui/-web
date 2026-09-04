import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DASHBOARD_PATH,
  parseWebPushPayload,
  sanitizeDashboardPath,
} from '@/lib/push/notification-payload'

describe('sanitizeDashboardPath', () => {
  it('allows dashboard paths', () => {
    expect(sanitizeDashboardPath('/dashboard')).toBe('/dashboard')
    expect(sanitizeDashboardPath('/dashboard/')).toBe('/dashboard/')
    expect(sanitizeDashboardPath('/dashboard/announcements/1')).toBe(
      '/dashboard/announcements/1',
    )
    expect(sanitizeDashboardPath('/dashboard/chat/room?x=1')).toBe(
      '/dashboard/chat/room?x=1',
    )
    expect(sanitizeDashboardPath('/dashboard?tab=1')).toBe('/dashboard?tab=1')
  })

  it('rejects unsafe or non-student paths', () => {
    expect(sanitizeDashboardPath('/dashboard-evil')).toBe(DEFAULT_DASHBOARD_PATH)
    expect(sanitizeDashboardPath('/admin')).toBe(DEFAULT_DASHBOARD_PATH)
    expect(sanitizeDashboardPath('/admin/students')).toBe(DEFAULT_DASHBOARD_PATH)
    expect(sanitizeDashboardPath('/login')).toBe(DEFAULT_DASHBOARD_PATH)
    expect(sanitizeDashboardPath('https://evil.example/')).toBe(DEFAULT_DASHBOARD_PATH)
    expect(sanitizeDashboardPath('//evil.example')).toBe(DEFAULT_DASHBOARD_PATH)
    expect(sanitizeDashboardPath('javascript:alert(1)')).toBe(DEFAULT_DASHBOARD_PATH)
    expect(sanitizeDashboardPath('data:text/html,hi')).toBe(DEFAULT_DASHBOARD_PATH)
    expect(sanitizeDashboardPath('/dashboard/\n/admin')).toBe(DEFAULT_DASHBOARD_PATH)
    expect(sanitizeDashboardPath(null)).toBe(DEFAULT_DASHBOARD_PATH)
    expect(sanitizeDashboardPath(123)).toBe(DEFAULT_DASHBOARD_PATH)
  })
})

describe('parseWebPushPayload', () => {
  it('falls back safely for invalid payloads', () => {
    expect(parseWebPushPayload('')).toMatchObject({
      title: '受験生web',
      body: '新しいお知らせがあります',
      targetPath: '/dashboard',
    })
    expect(parseWebPushPayload('not-json')).toMatchObject({
      targetPath: '/dashboard',
    })
    expect(parseWebPushPayload('{"title":1,"body":true,"targetPath":"/admin"}')).toMatchObject({
      title: '受験生web',
      body: '新しいお知らせがあります',
      targetPath: '/dashboard',
    })
  })

  it('parses a valid minimal payload', () => {
    const parsed = parseWebPushPayload(
      JSON.stringify({
        title: 'お知らせ',
        body: '新しいお知らせがあります',
        targetPath: '/dashboard/announcements/abc',
        tag: 'announcement:abc',
      }),
    )
    expect(parsed).toEqual({
      title: 'お知らせ',
      body: '新しいお知らせがあります',
      targetPath: '/dashboard/announcements/abc',
      tag: 'announcement:abc',
    })
  })
})
