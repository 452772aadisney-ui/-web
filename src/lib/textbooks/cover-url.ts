const AMAZON_ASIN_PATTERNS = [
  /amazon\.(?:co\.jp|com|de|co\.uk|fr|ca|[a-z.]{2,})\/(?:[^/]+\/)?(?:dp|gp\/product|exec\/obidos\/ASIN|o\/ASIN)\/([A-Z0-9]{10})/i,
  /amazon\.(?:co\.jp|com|de|co\.uk|fr|ca|[a-z.]{2,})\/[^/]+\/([A-Z0-9]{10})(?:[/?]|$)/i,
]

const DIRECT_IMAGE_PATTERN = /^https?:\/\/.+\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i

/** Amazon商品ページURLからASIN（10桁）を抽出 */
export function extractAmazonAsin(url: string): string | null {
  for (const pattern of AMAZON_ASIN_PATTERNS) {
    const match = url.match(pattern)
    if (match?.[1]) return match[1].toUpperCase()
  }
  return null
}

/** 表紙URL入力を表示用の画像URLに正規化（Amazon商品URL対応） */
export function resolveTextbookCoverUrl(input: string | null | undefined): string | null {
  const trimmed = (input ?? '').trim()
  if (!trimmed) return null

  if (DIRECT_IMAGE_PATTERN.test(trimmed)) {
    return trimmed
  }

  const asin = extractAmazonAsin(trimmed)
  if (!asin) {
    return trimmed
  }

  // 書籍の表紙でよく使われるAmazon CDN（ASIN/ISBNベース）
  return `https://images-fe.ssl-images-amazon.com/images/P/${asin}.09.LZZZZZZZ.jpg`
}

export function isAmazonProductUrl(input: string): boolean {
  return /amazon\./i.test(input) && extractAmazonAsin(input) !== null
}
