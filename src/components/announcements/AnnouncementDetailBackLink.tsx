'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

const ARTICLE_ID = 'announcement-article-body'

interface AnnouncementDetailBackLinkProps {
  href?: string
  label?: string
}

/**
 * Shows a bottom back link only when the announcement body is taller than the
 * viewport (content needs scrolling). Top BackButton remains separate.
 */
export function AnnouncementDetailBackLink({
  href = '/dashboard/announcements',
  label = '← お知らせ一覧に戻る',
}: AnnouncementDetailBackLinkProps) {
  const [showBottomLink, setShowBottomLink] = useState(false)

  useEffect(() => {
    const article = document.getElementById(ARTICLE_ID)
    if (!article) return

    function update() {
      const el = document.getElementById(ARTICLE_ID)
      if (!el) {
        setShowBottomLink(false)
        return
      }
      setShowBottomLink(el.getBoundingClientRect().height > window.innerHeight)
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(article)
    window.addEventListener('resize', update)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  if (!showBottomLink) return null

  return (
    <Link
      href={href}
      className="mt-6 inline-block text-sm font-medium text-primary hover:underline"
    >
      {label}
    </Link>
  )
}

export const ANNOUNCEMENT_ARTICLE_BODY_ID = ARTICLE_ID
