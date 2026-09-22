import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('listAssignedStudentsForCourseUnit query', () => {
  it('disambiguates profiles embed via student_id (not ambiguous profiles())', () => {
    const src = readFileSync(
      join(process.cwd(), 'src', 'app', 'class-course', 'actions.ts'),
      'utf8',
    )
    const fnStart = src.indexOf('export async function listAssignedStudentsForCourseUnit')
    expect(fnStart).toBeGreaterThanOrEqual(0)
    const body = src.slice(fnStart, fnStart + 1200)
    expect(body).toMatch(/profiles!student_id\(/)
    expect(body).not.toMatch(/\.select\('student_id, profiles\(/)
    expect(body).toMatch(/ok: false/)
    expect(body).toMatch(/割当生徒の取得に失敗しました/)
  })
})
