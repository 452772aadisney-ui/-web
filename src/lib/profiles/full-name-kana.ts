/** Max length for profiles.full_name_kana (must match DB CHECK). */
export const FULL_NAME_KANA_MAX_LENGTH = 80

export const FULL_NAME_KANA_EXAMPLE = 'やまだ たろう'

/**
 * Allowed after normalization:
 * - Hiragana (ぁ–ゖ)
 * - Prolonged sound mark ー
 * - Middle dot ・
 * - Single half-width spaces between name parts
 *
 * Half/full-width spaces are collapsed to one half-width space.
 * Katakana is converted to hiragana. Kanji reading is never inferred.
 */

const HIRAGANA_OR_MARK =
  /^[\u3041-\u3096ー・]+(?: [\u3041-\u3096ー・]+)*$/u

function hasControlChars(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true
  }
  return false
}

/** Katakana (ァ–ヶ) → hiragana; ー / ・ kept. */
function katakanaToHiragana(value: string): string {
  let out = ''
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0
    if (code >= 0x30a1 && code <= 0x30f6) {
      out += String.fromCodePoint(code - 0x60)
    } else {
      out += ch
    }
  }
  return out
}

/**
 * Normalize raw input for storage / compare.
 * Returns null when the value is empty after trim (do not store '').
 * Does not validate character set — use parseFullNameKana for that.
 */
export function normalizeFullNameKanaInput(raw: string | null | undefined): string | null {
  if (raw == null) return null

  let value = String(raw).normalize('NFKC')
  if (hasControlChars(value)) {
    // Leave for validate to reject; still strip for compare attempts after fail.
    value = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
  }

  value = katakanaToHiragana(value)
  value = value.replace(/[\u3000\u00a0]/g, ' ')
  value = value.replace(/ +/g, ' ').trim()

  if (!value) return null
  return value
}

export type FullNameKanaParseResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string }

/**
 * Parse admin/signup kana input.
 * - required=true: empty → error
 * - required=false: empty → null (clear allowed)
 */
export function parseFullNameKana(
  raw: string | null | undefined,
  options: { required: boolean },
): FullNameKanaParseResult {
  const original = raw == null ? '' : String(raw)
  if (hasControlChars(original.normalize('NFKC'))) {
    return { ok: false, error: '氏名かなに使用できない文字が含まれています' }
  }

  const normalized = normalizeFullNameKanaInput(raw)

  if (normalized == null) {
    if (options.required) {
      return { ok: false, error: '氏名かなを入力してください' }
    }
    return { ok: true, value: null }
  }

  if (normalized.length > FULL_NAME_KANA_MAX_LENGTH) {
    return {
      ok: false,
      error: `氏名かなは${FULL_NAME_KANA_MAX_LENGTH}文字以内で入力してください`,
    }
  }

  if (!HIRAGANA_OR_MARK.test(normalized)) {
    return {
      ok: false,
      error: `氏名かなはひらがなで入力してください（例: ${FULL_NAME_KANA_EXAMPLE}）`,
    }
  }

  return { ok: true, value: normalized }
}

/** Compare key: null/empty sorts after any set kana within the same grade. */
export function fullNameKanaSortKey(kana: string | null | undefined): string | null {
  return normalizeFullNameKanaInput(kana)
}

/**
 * Build an ilike pattern for searching stored full_name_kana.
 * Uses hiragana-normalized input so カタカナ searches match saved ひらがな.
 * Returns null when the query has no usable kana after normalize+sanitize.
 */
export function fullNameKanaIlikePattern(rawQuery: string): string | null {
  const normalized = normalizeFullNameKanaInput(rawQuery)
  if (!normalized) return null
  const cleaned = normalized.replace(/[%_,.()\\]/g, '')
  if (!cleaned) return null
  if (!/^[\u3041-\u3096ー・]+(?: [\u3041-\u3096ー・]+)*$/u.test(cleaned)) {
    return null
  }
  return `%${cleaned}%`
}
