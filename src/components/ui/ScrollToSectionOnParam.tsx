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
 * Skips the initial mount unless landing with a non-default param.
 */
export function ScrollToSectionOnParam({
  sectionId,
  paramValue,
  offsetRem = 5,
}: ScrollToSectionOnParamProps) {
  const isFirstRender = useRef(true)

  useEffect(() => {
    const isDefault =
      paramValue == null ||
      paramValue === '' ||
      paramValue === 1 ||
      paramValue === '1'

    if (isFirstRender.current) {
      isFirstRender.current = false
      if (isDefault) return
    }

    const el = document.getElementById(sectionId)
    if (!el) return

    const top = el.getBoundingClientRect().top + window.scrollY - offsetRem * 16
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  }, [sectionId, paramValue, offsetRem])

  return null
}
