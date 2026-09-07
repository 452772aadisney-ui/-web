import { describe, expect, it } from 'vitest'
import {
  aggregateActivePushRowsForStudents,
  derivePushRegistrationView,
  filterStudentIdsByPushRegistration,
  parsePushRegistrationFilter,
} from '@/lib/admin/push-registration'

describe('parsePushRegistrationFilter', () => {
  it('accepts registered / unregistered and falls back to all', () => {
    expect(parsePushRegistrationFilter('registered')).toBe('registered')
    expect(parsePushRegistrationFilter('unregistered')).toBe('unregistered')
    expect(parsePushRegistrationFilter('all')).toBe('all')
    expect(parsePushRegistrationFilter('nope')).toBe('all')
    expect(parsePushRegistrationFilter(undefined)).toBe('all')
  })
})

describe('derivePushRegistrationView', () => {
  it('maps counts to labels without claiming OS permission', () => {
    expect(derivePushRegistrationView(null)).toEqual({
      status: 'unknown',
      activeCount: null,
      label: '確認不能',
    })
    expect(derivePushRegistrationView(0)).toEqual({
      status: 'unregistered',
      activeCount: 0,
      label: 'Push未登録',
    })
    expect(derivePushRegistrationView(1)).toEqual({
      status: 'registered',
      activeCount: 1,
      label: 'Push登録済み',
    })
    expect(derivePushRegistrationView(2).label).toBe('Push登録済み（2台）')
    expect(derivePushRegistrationView(3).label).toBe('Push登録済み（3台）')
  })
})

describe('aggregateActivePushRowsForStudents', () => {
  const students = ['s1', 's2', 's3']

  it('counts only active rows and ignores other users', () => {
    const result = aggregateActivePushRowsForStudents(students, [
      { user_id: 's1' },
      { user_id: 's1' },
      { user_id: 's2' },
      { user_id: 'admin-or-other' },
    ])

    expect(result.countsByUserId.get('s1')).toBe(2)
    expect(result.countsByUserId.get('s2')).toBe(1)
    expect(result.countsByUserId.get('s3') ?? 0).toBe(0)
    expect(result.studentsWithActivePush).toBe(2)
    expect(result.studentsWithoutActivePush).toBe(1)
    expect(result.activeSubscriptionCount).toBe(3)
    expect(result.multiDeviceStudentCount).toBe(1)
  })

  it('treats disabled-only users as zero when no active rows are supplied', () => {
    const result = aggregateActivePushRowsForStudents(students, [])
    expect(result.studentsWithActivePush).toBe(0)
    expect(result.studentsWithoutActivePush).toBe(3)
    expect(result.activeSubscriptionCount).toBe(0)
  })
})

describe('filterStudentIdsByPushRegistration', () => {
  const ids = ['a', 'b', 'c']
  const counts = new Map([
    ['a', 1],
    ['b', 0],
    ['c', 2],
  ])

  it('filters registered and unregistered without dropping order', () => {
    expect(filterStudentIdsByPushRegistration(ids, counts, 'all')).toEqual(ids)
    expect(filterStudentIdsByPushRegistration(ids, counts, 'registered')).toEqual([
      'a',
      'c',
    ])
    expect(filterStudentIdsByPushRegistration(ids, counts, 'unregistered')).toEqual([
      'b',
    ])
  })

  it('treats missing map entries as unregistered', () => {
    expect(
      filterStudentIdsByPushRegistration(['x'], new Map(), 'unregistered'),
    ).toEqual(['x'])
    expect(filterStudentIdsByPushRegistration(['x'], new Map(), 'registered')).toEqual([])
  })
})
