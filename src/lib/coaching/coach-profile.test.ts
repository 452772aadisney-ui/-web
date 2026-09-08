import { describe, expect, it } from 'vitest'
import {
  getCoachAttributeTags,
  getCoachFeatureLabels,
  getCoachNameInitial,
  getCoachProfileBadges,
  getCoachStrongSubjects,
  summarizeCoachText,
} from '@/lib/coaching/coach-profile'
import type { CoachingCoach } from '@/types/coaching'

function coach(partial: Partial<CoachingCoach> = {}): CoachingCoach {
  return {
    id: 'c1',
    name: '山田太郎',
    is_active: true,
    sort_order: 0,
    stream: null,
    school_types: [],
    exam_types: [],
    has_internal_recommendation_experience: false,
    strong_subjects: [],
    feature_tags: [],
    bio: '',
    created_at: '',
    updated_at: '',
    ...partial,
  }
}

describe('coach profile display helpers', () => {
  it('splits attributes, subjects, and features', () => {
    const row = coach({
      stream: 'sciences',
      school_types: ['国公立'],
      exam_types: ['一般受験'],
      has_internal_recommendation_experience: true,
      strong_subjects: ['数学', '物理'],
      feature_tags: ['難関大'],
    })
    expect(getCoachAttributeTags(row)).toEqual(['理系', '国公立', '一般受験'])
    expect(getCoachStrongSubjects(row)).toEqual(['数学', '物理'])
    expect(getCoachFeatureLabels(row)).toEqual(['内部推薦経験あり', '難関大'])
    expect(getCoachProfileBadges(row).length).toBe(7)
  })

  it('handles empty profile without inventing placeholders', () => {
    const row = coach({ name: '佐藤' })
    expect(getCoachAttributeTags(row)).toEqual([])
    expect(getCoachStrongSubjects(row)).toEqual([])
    expect(getCoachFeatureLabels(row)).toEqual([])
    expect(getCoachNameInitial(row.name)).toBe('佐')
    expect(getCoachNameInitial('')).toBe('?')
    expect(getCoachNameInitial('!!!')).toBe('?')
    expect(getCoachNameInitial('ABC')).toBe('A')
    expect(summarizeCoachText(null)).toBeNull()
  })

  it('summarizes long bio for admin cards', () => {
    const long = 'あ'.repeat(120)
    expect(summarizeCoachText(long, 80)?.endsWith('…')).toBe(true)
    expect(summarizeCoachText(long, 80)?.length).toBe(80)
  })
})
