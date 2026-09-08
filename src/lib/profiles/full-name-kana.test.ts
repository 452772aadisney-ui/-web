import { describe, expect, it } from 'vitest'
import {
  FULL_NAME_KANA_MAX_LENGTH,
  fullNameKanaIlikePattern,
  normalizeFullNameKanaInput,
  parseFullNameKana,
} from '@/lib/profiles/full-name-kana'

describe('normalizeFullNameKanaInput', () => {
  it('keeps hiragana and trims', () => {
    expect(normalizeFullNameKanaInput('  やまだ たろう  ')).toBe('やまだ たろう')
  })

  it('converts katakana to hiragana', () => {
    expect(normalizeFullNameKanaInput('ヤマダ　タロウ')).toBe('やまだ たろう')
  })

  it('collapses half and full-width spaces', () => {
    expect(normalizeFullNameKanaInput('やまだ　　たろう')).toBe('やまだ たろう')
    expect(normalizeFullNameKanaInput('やまだ  たろう')).toBe('やまだ たろう')
  })

  it('returns null for empty after trim', () => {
    expect(normalizeFullNameKanaInput('')).toBeNull()
    expect(normalizeFullNameKanaInput('   ')).toBeNull()
    expect(normalizeFullNameKanaInput(null)).toBeNull()
  })

  it('keeps prolonged sound mark', () => {
    expect(normalizeFullNameKanaInput('さーとし')).toBe('さーとし')
    expect(normalizeFullNameKanaInput('サートシ')).toBe('さーとし')
  })
})

describe('parseFullNameKana', () => {
  it('requires value when required', () => {
    const result = parseFullNameKana('  ', { required: true })
    expect(result.ok).toBe(false)
  })

  it('allows null when optional', () => {
    expect(parseFullNameKana('', { required: false })).toEqual({ ok: true, value: null })
  })

  it('accepts valid hiragana and normalizes katakana', () => {
    expect(parseFullNameKana('やまだ たろう', { required: true })).toEqual({
      ok: true,
      value: 'やまだ たろう',
    })
    expect(parseFullNameKana('ヤマダ タロウ', { required: true })).toEqual({
      ok: true,
      value: 'やまだ たろう',
    })
  })

  it('rejects over max length', () => {
    const tooLong = 'あ'.repeat(FULL_NAME_KANA_MAX_LENGTH + 1)
    const result = parseFullNameKana(tooLong, { required: true })
    expect(result.ok).toBe(false)
  })

  it('rejects control characters and kanji', () => {
    expect(parseFullNameKana('やまだ\u0000たろう', { required: true }).ok).toBe(false)
    expect(parseFullNameKana('山田 太郎', { required: true }).ok).toBe(false)
    expect(parseFullNameKana('yamada', { required: true }).ok).toBe(false)
  })
})

describe('fullNameKanaIlikePattern', () => {
  it('normalizes katakana search to hiragana pattern', () => {
    expect(fullNameKanaIlikePattern('ヤマダ')).toBe('%やまだ%')
    expect(fullNameKanaIlikePattern('やまだ')).toBe('%やまだ%')
  })

  it('returns null for empty or non-kana queries', () => {
    expect(fullNameKanaIlikePattern('')).toBeNull()
    expect(fullNameKanaIlikePattern('山田')).toBeNull()
    expect(fullNameKanaIlikePattern('%%%')).toBeNull()
  })
})
