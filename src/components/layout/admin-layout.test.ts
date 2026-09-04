import { describe, expect, it } from 'vitest'
import {
  ADMIN_COMFORTABLE_CONTENT_CLASS,
  ADMIN_NARROW_CONTENT_CLASS,
  ADMIN_SHELL_MAX_WIDTH_CLASS,
} from '@/components/layout/admin-layout'

describe('admin layout width constants', () => {
  it('keeps a single shell max width for header, nav, and main', () => {
    expect(ADMIN_SHELL_MAX_WIDTH_CLASS).toBe('max-w-6xl')
  })

  it('provides inner content widths for forms and prose pages', () => {
    expect(ADMIN_NARROW_CONTENT_CLASS).toBe('max-w-2xl')
    expect(ADMIN_COMFORTABLE_CONTENT_CLASS).toBe('max-w-3xl')
  })
})
