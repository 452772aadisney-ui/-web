'use client'

import { useEffect, useRef } from 'react'

interface ScrollToSectionOnParamProps {
  sectionId: string
  /** When this value changes, scroll to the section (sticky-header offset applied). */
  paramValue: string | number | null | undefined
  /** Sticky header offset in rem (default ~5rem). */
  offsetRem?: number
}

/**
 * Scrolls to `#sectionId` when `paramValue` changes (e.g. pagination query).
 * Skips the initial mount so first paint stays at the top of the page.
 */
export function ScrollToSectionOnParam({
  sectionId,
  paramValue,
  offsetRem = 5,
}: ScrollToSectionOnParamProps) {
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }

    const el = document.getElementById(sectionId)
    if (!el) return

    const top = el.getBoundingClientRect().top + window.scrollY - offsetRem * 16
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  }, [sectionId, paramValue, offsetRem])

  return null
}
