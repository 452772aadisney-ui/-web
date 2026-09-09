import { describe, expect, it } from 'vitest'
import {
  filterTextbooksByStudyCategory,
  getStudySubjectCategoriesForProfile,
  resolveStudySubjectCategory,
  sumScienceFamilyMinutes,
  textbookMatchesStudyCategory,
} from '@/lib/constants/textbook-subject-categories'
import { deriveStudyCategoryFromTextbook } from '@/lib/constants/textbook-subject-categories'

describe('study subject science split', () => {
  it('keeps math grouped and splits science for profile categories', () => {
    expect(
      getStudySubjectCategoriesForProfile(['数学IA', '数学IIBC', '物理', '化学基礎', '英語']),
    ).toEqual(['英語', '数学', '物理', '化学'])
  })

  it('maps 基礎 exam subjects to the four science study labels', () => {
    expect(resolveStudySubjectCategory('物理基礎')).toBe('物理')
    expect(resolveStudySubjectCategory('化学基礎')).toBe('化学')
    expect(resolveStudySubjectCategory('生物基礎')).toBe('生物')
    expect(resolveStudySubjectCategory('地学基礎')).toBe('地学')
  })

  it('keeps legacy 理科 and does not collapse 物理 into 理科', () => {
    expect(resolveStudySubjectCategory('理科')).toBe('理科')
    expect(resolveStudySubjectCategory('物理')).toBe('物理')
    expect(resolveStudySubjectCategory('化学')).toBe('化学')
  })

  it('filters textbooks by explicit science tags only', () => {
    const books = [
      { id: 'phys', subjects: ['理科'], detail_tags: ['物理'] },
      { id: 'chem', subjects: ['理科'], detail_tags: ['化学'] },
      { id: 'sci-only', subjects: ['理科'], detail_tags: ['その他（理科）'] },
      { id: 'bare-sci', subjects: ['理科'], detail_tags: [] },
    ]
    expect(filterTextbooksByStudyCategory(books, '物理').map((b) => b.id)).toEqual(['phys'])
    expect(filterTextbooksByStudyCategory(books, '化学').map((b) => b.id)).toEqual(['chem'])
    expect(textbookMatchesStudyCategory(books[2]!, '物理')).toBe(false)
    expect(textbookMatchesStudyCategory(books[3]!, '物理')).toBe(false)
    expect(filterTextbooksByStudyCategory(books, '理科').map((b) => b.id)).toEqual([
      'phys',
      'chem',
      'sci-only',
      'bare-sci',
    ])
  })

  it('derives textbook study category as science subject when profile allows', () => {
    expect(
      deriveStudyCategoryFromTextbook(['理科'], ['物理', '英語'], ['物理']),
    ).toBe('物理')
  })

  it('sums science family minutes without inventing assignments', () => {
    expect(
      sumScienceFamilyMinutes([
        { subject: '理科', minutes: 10 },
        { subject: '物理', minutes: 20 },
        { subject: '化学', minutes: 5 },
        { subject: '数学', minutes: 100 },
      ]),
    ).toBe(35)
  })
})
