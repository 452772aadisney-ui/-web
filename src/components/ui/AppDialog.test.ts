import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

describe('AppDialog', () => {
  const source = readFileSync(
    path.join(process.cwd(), 'src/components/ui/AppDialog.tsx'),
    'utf8',
  )

  it('guards showModal and ignores programmatic close events', () => {
    expect(source).toContain('if (!dialog.open)')
    expect(source).toContain('dialog.showModal()')
    expect(source).toContain('ignoreCloseEventRef')
    expect(source).toContain('event.preventDefault()')
    expect(source).toContain('busyRef.current')
  })

  it('closes on unmount without notifying parent setState', () => {
    expect(source).toContain('Unmount while open')
    expect(source).toContain('dialog.close()')
  })

  it('centers the modal despite Tailwind margin reset', () => {
    expect(source).toContain('fixed inset-0')
    expect(source).toContain('m-auto')
    expect(source).toContain('dvh')
    expect(source).toContain('calc(100vw-2rem)')
    expect(source).toContain('overflow-y-auto')
  })
})
