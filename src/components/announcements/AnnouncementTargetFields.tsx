'use client'

import { getPersonName } from '@/lib/auth/display-name'
import { groupTagsByCategory } from '@/lib/tags/group'
import type { AnnouncementWithTargets } from '@/types/announcement'
import type { StudentTag } from '@/types/tag'

const fieldClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

interface AnnouncementTargetFieldsProps {
  allTags: StudentTag[]
  students: Array<{ id: string; full_name: string; display_name: string }>
  announcement?: AnnouncementWithTargets
}

export function AnnouncementTargetFields({
  allTags,
  students,
  announcement,
}: AnnouncementTargetFieldsProps) {
  const grouped = groupTagsByCategory(allTags)
  const selectedTags = new Set(announcement?.target_tag_ids ?? [])
  const selectedStudents = new Set(announcement?.target_student_ids ?? [])
  const targetAll = announcement?.target_all ?? false

  return (
    <fieldset className="space-y-4 rounded-lg border border-border bg-background p-4">
      <legend className="px-1 text-sm font-medium">配信先</legend>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="targetAll"
          defaultChecked={targetAll}
          className="h-4 w-4 rounded border-border text-primary"
        />
        全員に配信
      </label>

      {allTags.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-muted">タグで指定（該当タグを持つ生徒）</p>
          {Array.from(grouped.entries()).map(([category, tags]) => (
            <div key={category} className="mb-3">
              <p className="mb-1 text-xs text-muted">{category}</p>
              <div className="flex flex-wrap gap-3">
                {tags.map((tag) => (
                  <label key={tag.id} className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="targetTagIds"
                      value={tag.id}
                      defaultChecked={selectedTags.has(tag.id)}
                      className="h-4 w-4 rounded border-border text-primary"
                    />
                    {tag.name}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {students.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-muted">生徒を個別指定</p>
          <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
            {students.map((student) => (
              <label key={student.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="targetStudentIds"
                  value={student.id}
                  defaultChecked={selectedStudents.has(student.id)}
                  className="h-4 w-4 rounded border-border text-primary"
                />
                {getPersonName(student)}
              </label>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-muted">
        「全員」以外の場合、タグと個別指定は合算されます（どちらかに該当すれば配信）。
      </p>
    </fieldset>
  )
}

export { fieldClass }
