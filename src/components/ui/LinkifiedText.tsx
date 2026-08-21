import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi

function trimTrailingPunctuation(url: string): { href: string; trailing: string } {
  let href = url
  let trailing = ''
  while (href.length > 0 && /[.,;:!?)}\]'"]/.test(href[href.length - 1]!)) {
    trailing = href[href.length - 1]! + trailing
    href = href.slice(0, -1)
  }
  return { href, trailing }
}

function linkify(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let lastIndex = 0
  const regex = new RegExp(URL_REGEX.source, 'gi')
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }

    const raw = match[0]
    const { href, trailing } = trimTrailingPunctuation(raw)

    if (href) {
      nodes.push(
        <a
          key={`url-${match.index}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-primary underline underline-offset-2 hover:opacity-80"
        >
          {href}
        </a>,
      )
      if (trailing) {
        nodes.push(trailing)
      }
    } else {
      nodes.push(raw)
    }

    lastIndex = match.index + raw.length
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes.length > 0 ? nodes : [text]
}

interface LinkifiedTextProps {
  text: string
  className?: string
}

export function LinkifiedText({ text, className }: LinkifiedTextProps) {
  return (
    <div className={cn('whitespace-pre-wrap break-words text-sm leading-relaxed', className)}>
      {linkify(text)}
    </div>
  )
}
