import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

describe('instructor management UI wiring', () => {
  it('uses 講師管理 labels and modal-first manager', () => {
    const nav = readFileSync(
      path.join(process.cwd(), 'src/components/coaching/AdminCoachingNav.tsx'),
      'utf8',
    )
    const menu = readFileSync(
      path.join(process.cwd(), 'src/components/coaching/AdminCoachingMenu.tsx'),
      'utf8',
    )
    const page = readFileSync(
      path.join(process.cwd(), 'src/app/admin/coaching/instructors/page.tsx'),
      'utf8',
    )
    const manager = readFileSync(
      path.join(
        process.cwd(),
        'src/components/coaching/AdminCoachingInstructorsManager.tsx',
      ),
      'utf8',
    )

    expect(nav).toContain("label: '講師管理'")
    expect(menu).toContain("label: '講師管理'")
    expect(page).toContain('title="講師管理"')
    expect(manager).toContain('講師を追加')
    expect(manager).toContain('AppDialog')
    expect(manager).toContain('CreateCoachDialog')
    expect(manager).toContain('EditCoachDialog')
    expect(manager).toContain('登録済み講師')
    expect(manager).not.toMatch(/<CoachForm\s*\/>/)
  })

  it('shares CoachProfileDisplay for student and preview', () => {
    const display = readFileSync(
      path.join(process.cwd(), 'src/components/coaching/CoachProfileDisplay.tsx'),
      'utf8',
    )
    const booking = readFileSync(
      path.join(process.cwd(), 'src/components/coaching/StudentCoachingBooking.tsx'),
      'utf8',
    )
    const manager = readFileSync(
      path.join(
        process.cwd(),
        'src/components/coaching/AdminCoachingInstructorsManager.tsx',
      ),
      'utf8',
    )

    expect(display).toContain('得意科目')
    expect(display).toContain('getCoachNameInitial')
    expect(booking).toContain('CoachProfileDisplay')
    expect(manager).toContain('<CoachProfileDisplay coach={coach} variant="plain"')
  })
})
