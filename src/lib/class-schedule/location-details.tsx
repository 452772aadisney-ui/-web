import { createElement, type ReactNode } from 'react'

const HTTPS_URL_RE = /https:\/\/[^\s<>"'`]+/gi

function stripTrailingPunctuation(raw: string): string {
  return raw.replace(/[),.;:!?，。]+$/u, '')
}

function sanitizeHttpsUrl(raw: string): string | null {
  const candidate = stripTrailingPunctuation(raw)
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'https:') return null
    // Block embedded credentials weirdness is fine; only https allowed.
    return url.toString()
  } catch {
    return null
  }
}

export type LocationDetailsSegment =
  | { type: 'text'; value: string }
  | { type: 'link'; href: string; label: string }

/** Split plain text into text + safe https links (no HTML parsing). */
export function splitLocationDetailsSegments(
  value: string,
): LocationDetailsSegment[] {
  if (!value) return []
  const segments: LocationDetailsSegment[] = []
  let lastIndex = 0
  const re = new RegExp(HTTPS_URL_RE.source, 'gi')
  let match: RegExpExecArray | null
  while ((match = re.exec(value)) != null) {
    const raw = match[0]
    const start = match.index
    if (start > lastIndex) {
      segments.push({ type: 'text', value: value.slice(lastIndex, start) })
    }
    const label = stripTrailingPunctuation(raw)
    const href = sanitizeHttpsUrl(raw)
    if (href && label) {
      segments.push({ type: 'link', href, label })
      const trailing = raw.slice(label.length)
      if (trailing) segments.push({ type: 'text', value: trailing })
    } else {
      segments.push({ type: 'text', value: raw })
    }
    lastIndex = start + raw.length
  }
  if (lastIndex < value.length) {
    segments.push({ type: 'text', value: value.slice(lastIndex) })
  }
  return segments
}

/** React nodes with newlines preserved; only https links are clickable. */
export function renderLocationDetailsWithLinks(
  value: string,
  keyPrefix = 'loc',
): ReactNode[] {
  const nodes: ReactNode[] = []

  splitLocationDetailsSegments(value).forEach((segment, index) => {
    if (segment.type === 'text') {
      const lines = segment.value.split('\n')
      lines.forEach((line, lineIndex) => {
        if (lineIndex > 0) {
          nodes.push(
            createElement('br', { key: `${keyPrefix}-br-${index}-${lineIndex}` }),
          )
        }
        if (line) nodes.push(line)
      })
      return
    }

    nodes.push(
      createElement(
        'a',
        {
          key: `${keyPrefix}-a-${index}`,
          href: segment.href,
          target: '_blank',
          rel: 'noopener noreferrer',
          className:
            'break-all font-medium text-primary underline-offset-2 hover:underline',
        },
        segment.label,
      ),
    )
  })

  return nodes
}

/** Prefer location_details; else join legacy fields without empty lines. */
export function resolveLocationDetailsText(day: {
  location_details?: string | null
  address?: string | null
  map_url?: string | null
  room_note?: string | null
}): string | null {
  const primary = (day.location_details ?? '').replace(/^\s+|\s+$/g, '')
  if (primary) return primary

  const parts = [day.address, day.map_url, day.room_note]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
  if (parts.length === 0) return null
  return parts.join('\n')
}
