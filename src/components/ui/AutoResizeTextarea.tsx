'use client'

import { useCallback, useEffect, useRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface AutoResizeTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  minRows?: number
  maxRows?: number
}

export function AutoResizeTextarea({
  minRows = 3,
  maxRows = 20,
  className,
  onChange,
  onKeyDown,
  value,
  defaultValue,
  ...props
}: AutoResizeTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const resize = useCallback(() => {
    const el = ref.current
    if (!el) return

    el.style.height = 'auto'
    const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight) || 24
    const padding =
      Number.parseFloat(getComputedStyle(el).paddingTop) +
      Number.parseFloat(getComputedStyle(el).paddingBottom)
    const maxHeight = lineHeight * maxRows + padding
    const minHeight = lineHeight * minRows + padding
    const nextHeight = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight)
    el.style.height = `${nextHeight}px`
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [minRows, maxRows])

  useEffect(() => {
    resize()
  }, [value, defaultValue, resize])

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Tab') {
      event.preventDefault()
      const el = event.currentTarget
      const start = el.selectionStart ?? 0
      const end = el.selectionEnd ?? 0
      const tab = '\u3000'
      const nextValue = `${el.value.substring(0, start)}${tab}${el.value.substring(end)}`

      const valueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      )?.set
      valueSetter?.call(el, nextValue)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.selectionStart = el.selectionEnd = start + tab.length
    }

    onKeyDown?.(event)
  }

  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      defaultValue={defaultValue}
      onChange={(event) => {
        onChange?.(event)
        resize()
      }}
      onKeyDown={handleKeyDown}
      className={cn(className)}
      {...props}
    />
  )
}
