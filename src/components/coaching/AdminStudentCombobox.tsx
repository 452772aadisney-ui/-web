'use client'

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { getPersonName } from '@/lib/auth/display-name'
import {
  filterCoachingProxyStudentGroups,
  groupStudentsForCoachingProxy,
} from '@/lib/coaching/proxy-student-groups'
import type { StudentListItem } from '@/lib/tags/grade-order'
import { cn } from '@/lib/utils'

const fieldClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

type FlatOption = {
  id: string
  label: string
  groupLabel: string
}

interface AdminStudentComboboxProps {
  students: StudentListItem[]
  gradeTagByStudentId: Map<string, string> | Record<string, string>
  value: string
  onChange: (studentId: string) => void
  disabled?: boolean
}

function toGradeMap(
  input: Map<string, string> | Record<string, string>,
): Map<string, string> {
  return input instanceof Map ? input : new Map(Object.entries(input))
}

export function AdminStudentCombobox({
  students,
  gradeTagByStudentId,
  value,
  onChange,
  disabled = false,
}: AdminStudentComboboxProps) {
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const gradeMap = useMemo(() => toGradeMap(gradeTagByStudentId), [gradeTagByStudentId])

  const groups = useMemo(
    () =>
      filterCoachingProxyStudentGroups(
        groupStudentsForCoachingProxy(students, gradeMap),
        query,
      ),
    [students, gradeMap, query],
  )

  const flatOptions = useMemo(() => {
    const options: FlatOption[] = []
    for (const group of groups) {
      for (const student of group.students) {
        options.push({
          id: student.id,
          label: `${getPersonName(student)}${
            student.student_code ? `（${student.student_code}）` : ''
          }`,
          groupLabel: group.gradeLabel,
        })
      }
    }
    return options
  }, [groups])

  const selected = students.find((student) => student.id === value) ?? null

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        inputRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  useEffect(() => {
    setActiveIndex(0)
  }, [query, open])

  function selectStudent(studentId: string) {
    onChange(studentId)
    setQuery('')
    setOpen(false)
    inputRef.current?.focus()
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter')) {
      setOpen(true)
      return
    }
    if (!open) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) =>
        flatOptions.length === 0 ? 0 : Math.min(index + 1, flatOptions.length - 1),
      )
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const option = flatOptions[activeIndex]
      if (option) selectStudent(option.id)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">1. 生徒を選ぶ *</span>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && flatOptions[activeIndex]
              ? `${listboxId}-option-${flatOptions[activeIndex].id}`
              : undefined
          }
          disabled={disabled}
          value={open ? query : selected ? getPersonName(selected) : query}
          placeholder="生徒名・生徒番号で検索"
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
            if (value) onChange('')
          }}
          onFocus={() => {
            setOpen(true)
            setQuery('')
          }}
          onKeyDown={onInputKeyDown}
          className={fieldClass}
          autoComplete="off"
        />
      </label>

      {selected && !open && (
        <p className="mt-1.5 text-sm text-muted">
          選択中: <span className="font-medium text-foreground">{getPersonName(selected)}</span>
          {selected.student_code ? `（${selected.student_code}）` : ''}
        </p>
      )}

      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="生徒候補"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg"
        >
          {flatOptions.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted" role="status">
              該当する生徒がいません
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.gradeLabel} role="group" aria-label={group.gradeLabel}>
                <p className="sticky top-0 bg-background px-3 py-1.5 text-xs font-semibold text-muted">
                  {group.gradeLabel}
                </p>
                <ul>
                  {group.students.map((student) => {
                    const optionIndex = flatOptions.findIndex((item) => item.id === student.id)
                    const active = optionIndex === activeIndex
                    const label = `${getPersonName(student)}${
                      student.student_code ? `（${student.student_code}）` : ''
                    }`
                    return (
                      <li key={student.id}>
                        <button
                          type="button"
                          id={`${listboxId}-option-${student.id}`}
                          role="option"
                          aria-selected={student.id === value}
                          className={cn(
                            'flex w-full px-3 py-2 text-left text-sm hover:bg-blue-50',
                            active && 'bg-blue-50',
                            student.id === value && 'font-medium text-primary',
                          )}
                          onMouseEnter={() => setActiveIndex(optionIndex)}
                          onClick={() => selectStudent(student.id)}
                        >
                          {label}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
