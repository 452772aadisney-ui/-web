'use client'

import Link from 'next/link'
import { useActionState, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  addTextbookFromCatalog,
  createTextbook,
  deleteTextbook,
  updateTextbook,
  type TextbookActionState,
} from '@/app/textbooks/actions'
import { useAchievementUnlockDialog } from '@/components/achievements/useAchievementUnlockDialog'
import { useActionToast } from '@/hooks/useActionToast'
import { TextbookBookshelfListItem } from '@/components/textbooks/TextbookCatalogListItem'
import { TextbookDetailTagFields } from '@/components/textbooks/TextbookDetailTagFields'
import { TextbookSubjectTagsReadOnly } from '@/components/textbooks/TextbookSubjectTagsReadOnly'
import {
  TextbookDateFields,
  UsageTagFields,
  inputClass,
} from '@/components/textbooks/TextbookFormFields'
import {
  catalogMatchesCategory,
  filterTextbooksByStudyCategory,
  getStudySubjectCategoriesForProfile,
  type TextbookSubjectCategoryLabel,
} from '@/lib/constants/textbook-subject-categories'
import { Pagination } from '@/components/ui/Pagination'
import { cn } from '@/lib/utils'
import { formatTextbookPeriod } from '@/lib/textbooks/format'
import { canStudentEditTextbookSubjectTags } from '@/lib/textbooks/subject-tags'
import type { Textbook, TextbookCatalog } from '@/types/textbook'

const initialState: TextbookActionState = {}
const selectClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm'

type RegisterMode = 'catalog' | 'create'

interface StudentBookshelfManagerProps {
  studentId: string
  profileSubjects: string[]
  textbooks: Textbook[]
  catalog: TextbookCatalog[]
  registeredCatalogIds: string[]
  editHref?: string
  initialSubject: TextbookSubjectCategoryLabel
  variant: 'list' | 'register' | 'register-create-only'
  totalTextbookCount?: number
  totalAllTextbookCount?: number
  currentPage?: number
  pageSize?: number
}

function SubjectCategorySelect({
  categories,
  selectedSubject,
  onSelect,
}: {
  categories: TextbookSubjectCategoryLabel[]
  selectedSubject: TextbookSubjectCategoryLabel
  onSelect: (subject: TextbookSubjectCategoryLabel) => void
}) {
  if (categories.length === 0) return null

  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">科目</span>
      <select
        value={selectedSubject}
        onChange={(event) => onSelect(event.target.value as TextbookSubjectCategoryLabel)}
        className={selectClass}
      >
        {categories.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </select>
    </label>
  )
}

function TextbookEditForm({
  book,
  studentId,
  onCancel,
}: {
  book: Textbook
  studentId: string
  onCancel: () => void
}) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(
    updateTextbook.bind(null, studentId),
    initialState,
  )

  useActionToast(state, {
    successMessage: '教材を更新しました',
    pending,
  })

  useEffect(() => {
    if (state.success) {
      onCancel()
      router.refresh()
    }
  }, [state.success, onCancel, router])

  const canEditSubjectTags = canStudentEditTextbookSubjectTags(book, studentId)

  return (
    <form action={formAction} className="min-w-0 space-y-4 rounded-lg border border-primary/30 bg-blue-50/30 p-4">
      <input type="hidden" name="textbookId" value={book.id} />
      <label className="block w-full min-w-0">
        <span className="mb-1.5 block text-sm font-medium">
          教材名 <span className="text-error">*</span>
        </span>
        <input type="text" name="name" required defaultValue={book.name} className={inputClass} />
      </label>
      {canEditSubjectTags ? (
        <TextbookDetailTagFields defaultDetailTags={book.detail_tags} />
      ) : (
        <TextbookSubjectTagsReadOnly detailTags={book.detail_tags} subjects={book.subjects} />
      )}
      <UsageTagFields selectedUsageTags={book.usage_tags} />
      <TextbookDateFields startDate={book.start_date} plannedEndDate={book.planned_end_date} />
      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? '保存中…' : '保存'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-muted hover:text-foreground">
          キャンセル
        </button>
      </div>
    </form>
  )
}

function CatalogRegisterForm({
  studentId,
  profileSubjects,
  catalog,
  registeredCatalogIds,
  initialSubject,
}: {
  studentId: string
  profileSubjects: string[]
  catalog: TextbookCatalog[]
  registeredCatalogIds: string[]
  initialSubject: TextbookSubjectCategoryLabel
}) {
  const router = useRouter()
  const availableCategories = getStudySubjectCategoriesForProfile(profileSubjects)
  const [state, formAction, pending] = useActionState(
    addTextbookFromCatalog.bind(null, studentId),
    initialState,
  )
  const { dialog: achievementDialog } = useAchievementUnlockDialog(state.unlockedAchievements)
  const [categoryLabel, setCategoryLabel] = useState<TextbookSubjectCategoryLabel>(() =>
    availableCategories.includes(initialSubject) ? initialSubject : availableCategories[0]!,
  )
  const [catalogId, setCatalogId] = useState('')

  useActionToast(state, {
    successMessage: '教材を登録しました',
    pending,
  })

  function switchSubject(subject: TextbookSubjectCategoryLabel) {
    setCategoryLabel(subject)
    setCatalogId('')
    const params = new URLSearchParams()
    params.set('subject', subject)
    router.replace(`/dashboard/textbooks/register?${params.toString()}`, { scroll: false })
  }

  const availableCatalog = useMemo(() => {
    const registered = new Set(registeredCatalogIds)
    return catalog.filter((item) => {
      if (registered.has(item.id)) return false
      if (item.visibility === 'public' && item.is_searchable !== false) {
        return catalogMatchesCategory(
          { subjects: item.subjects, detail_tags: item.detail_tags },
          categoryLabel,
        )
      }
      return false
    })
  }, [catalog, registeredCatalogIds, categoryLabel])

  const selectedCatalog = catalog.find((item) => item.id === catalogId) ?? null

  return (
    <div className="space-y-4">
      {achievementDialog}
      <SubjectCategorySelect
        categories={availableCategories}
        selectedSubject={categoryLabel}
        onSelect={switchSubject}
      />

      <form action={formAction} className="space-y-4 rounded-lg border border-border bg-background p-4">
      <h3 className="font-medium">リストから選ぶ</h3>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">参考書</span>
        <select
          name="catalogId"
          value={catalogId}
          onChange={(event) => setCatalogId(event.target.value)}
          required
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
        >
          <option value="">選択してください</option>
          {availableCatalog.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        {availableCatalog.length === 0 && (
          <p className="mt-2 text-xs text-muted">この科目で選べる参考書はありません。</p>
        )}
      </label>

      {selectedCatalog && (
        <p className="text-xs text-muted">
          {selectedCatalog.subjects.join('・')}
          {selectedCatalog.usage_tags.length > 0
            ? ` / ${selectedCatalog.usage_tags.join('・')}`
            : ''}
        </p>
      )}

      <UsageTagFields selectedUsageTags={selectedCatalog?.usage_tags} />
      <TextbookDateFields />

      {state.error && (
        <p className="text-sm text-error" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !catalogId}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? '登録中…' : 'リストから登録'}
      </button>
      </form>
    </div>
  )
}

function CreateRegisterForm({
  studentId,
  profileSubjects,
}: {
  studentId: string
  profileSubjects: string[]
}) {
  const [state, formAction, pending] = useActionState(
    createTextbook.bind(null, studentId),
    initialState,
  )
  const { dialog: achievementDialog } = useAchievementUnlockDialog(state.unlockedAchievements)

  useActionToast(state, {
    successMessage: '教材を登録しました',
    pending,
  })

  return (
    <>
      {achievementDialog}
      <form action={formAction} className="space-y-4 rounded-lg border border-border bg-background p-4">
      <h3 className="font-medium">新規作成</h3>

      <label className="block w-full min-w-0">
        <span className="mb-1.5 block text-sm font-medium">
          教材名 <span className="text-error">*</span>
        </span>
        <input
          type="text"
          name="name"
          required
          placeholder="例: チャート式 数学IA"
          className={inputClass}
        />
      </label>

      <TextbookDetailTagFields />
      <UsageTagFields />
      <TextbookDateFields />

      {state.error && (
        <p className="text-sm text-error" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? '登録中…' : '教材を登録'}
      </button>
    </form>
    </>
  )
}

function StudentTextbookList({
  studentId,
  profileSubjects,
  textbooks,
  selectedSubject,
  totalTextbookCount,
  categoryTextbookCount,
}: {
  studentId: string
  profileSubjects: string[]
  textbooks: Textbook[]
  selectedSubject: TextbookSubjectCategoryLabel
  totalTextbookCount: number
  categoryTextbookCount?: number
}) {
  const [editingId, setEditingId] = useState<string | null>(null)

  if ((categoryTextbookCount ?? textbooks.length) === 0) {
    const registerHref = '/dashboard/textbooks/search'

    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">
          {totalTextbookCount === 0
            ? '登録された参考書はまだありません。'
            : `${selectedSubject}の参考書はまだありません。`}
        </p>
        <Link href={registerHref} className="text-sm font-medium text-primary hover:underline">
          教材を登録する →
        </Link>
      </div>
    )
  }

  return (
    <ul className="grid grid-cols-2 gap-3">
      {textbooks.map((book) => (
        <li key={book.id} className={cn('min-w-0', editingId === book.id && 'col-span-2')}>
          {editingId === book.id ? (
            <div className="rounded-xl border border-border bg-card p-4">
              <TextbookEditForm
                book={book}
                studentId={studentId}
                onCancel={() => setEditingId(null)}
              />
            </div>
          ) : (
            <TextbookBookshelfListItem
              name={book.name}
              coverUrl={book.cover_url}
              publisher={book.publisher}
              detailTags={book.detail_tags}
              subjects={book.subjects}
              usageTags={book.usage_tags}
              periodLabel={formatTextbookPeriod(book.start_date, book.planned_end_date)}
              isNew={!book.is_seen_by_student}
              layout="grid"
              actions={
                <>
                  <button
                    type="button"
                    onClick={() => setEditingId(book.id)}
                    className="text-xs text-primary hover:underline"
                  >
                    編集
                  </button>
                  <form action={deleteTextbook}>
                    <input type="hidden" name="textbookId" value={book.id} />
                    <input type="hidden" name="studentId" value={studentId} />
                    <button type="submit" className="text-xs text-error hover:underline">
                      削除
                    </button>
                  </form>
                </>
              }
            />
          )}
        </li>
      ))}
    </ul>
  )
}

function StudentTextbookListWithCategories({
  studentId,
  profileSubjects,
  textbooks,
  initialSubject,
  editHref,
  totalTextbookCount,
  totalAllTextbookCount,
  currentPage = 1,
  pageSize = 10,
}: {
  studentId: string
  profileSubjects: string[]
  textbooks: Textbook[]
  initialSubject: TextbookSubjectCategoryLabel
  editHref?: string
  totalTextbookCount?: number
  totalAllTextbookCount?: number
  currentPage?: number
  pageSize?: number
}) {
  const router = useRouter()
  const availableCategories = getStudySubjectCategoriesForProfile(profileSubjects)
  const [selectedSubject, setSelectedSubject] = useState<TextbookSubjectCategoryLabel>(() =>
    availableCategories.includes(initialSubject) ? initialSubject : availableCategories[0]!,
  )

  useEffect(() => {
    if (availableCategories.includes(initialSubject)) {
      setSelectedSubject(initialSubject)
    }
  }, [initialSubject, availableCategories])

  const categoryTotal = totalTextbookCount ?? textbooks.length
  const allTotal = totalAllTextbookCount ?? categoryTotal

  function switchSubject(subject: TextbookSubjectCategoryLabel) {
    setSelectedSubject(subject)
    const params = new URLSearchParams()
    params.set('subject', subject)
    router.replace(`/dashboard/bookshelf?${params.toString()}`, { scroll: false })
  }

  if (profileSubjects.length === 0) {
    return (
      <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
        使用科目が未設定です。{' '}
        {editHref ? (
          <Link href={editHref} className="font-medium underline">
            プロフィール編集
          </Link>
        ) : (
          'プロフィール編集'
        )}
        で科目を選んでから参考書を確認してください。
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SubjectCategorySelect
        categories={availableCategories}
        selectedSubject={selectedSubject}
        onSelect={switchSubject}
      />

      <section className="space-y-3">
        <h3 className="text-sm font-bold">{selectedSubject}の参考書</h3>
        <StudentTextbookList
          studentId={studentId}
          profileSubjects={profileSubjects}
          textbooks={textbooks}
          selectedSubject={selectedSubject}
          totalTextbookCount={allTotal}
          categoryTextbookCount={categoryTotal}
        />
        <Pagination
          currentPage={currentPage}
          totalCount={categoryTotal}
          pageSize={pageSize}
          pathname="/dashboard/bookshelf"
          preserveParams={{ subject: selectedSubject }}
        />
      </section>
    </div>
  )
}

function StudentTextbookRegister({
  studentId,
  profileSubjects,
  catalog,
  registeredCatalogIds,
  initialSubject,
  editHref,
}: {
  studentId: string
  profileSubjects: string[]
  catalog: TextbookCatalog[]
  registeredCatalogIds: string[]
  initialSubject: TextbookSubjectCategoryLabel
  editHref?: string
}) {
  const [mode, setMode] = useState<RegisterMode>('catalog')

  if (profileSubjects.length === 0) {
    return (
      <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
        使用科目が未設定です。{' '}
        {editHref ? (
          <Link href={editHref} className="font-medium underline">
            プロフィール編集
          </Link>
        ) : (
          'プロフィール編集'
        )}
        で科目を選んでから教材を登録してください。
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode('catalog')}
          className={`rounded-lg px-3 py-2.5 text-center text-sm font-bold ${
            mode === 'catalog'
              ? 'bg-primary text-white'
              : 'border border-border bg-background text-foreground'
          }`}
        >
          リストから選ぶ
        </button>
        <button
          type="button"
          onClick={() => setMode('create')}
          className={`rounded-lg px-3 py-2.5 text-center text-sm font-bold ${
            mode === 'create'
              ? 'bg-primary text-white'
              : 'border border-border bg-background text-foreground'
          }`}
        >
          新規作成
        </button>
      </div>

      {mode === 'catalog' ? (
        <CatalogRegisterForm
          studentId={studentId}
          profileSubjects={profileSubjects}
          catalog={catalog}
          registeredCatalogIds={registeredCatalogIds}
          initialSubject={initialSubject}
        />
      ) : (
        <CreateRegisterForm studentId={studentId} profileSubjects={profileSubjects} />
      )}
    </div>
  )
}

export function StudentBookshelfManager({
  studentId,
  profileSubjects,
  textbooks,
  catalog,
  registeredCatalogIds,
  editHref,
  initialSubject,
  variant,
  totalTextbookCount,
  totalAllTextbookCount,
  currentPage,
  pageSize,
}: StudentBookshelfManagerProps) {
  if (variant === 'register-create-only') {
    return <CreateRegisterForm studentId={studentId} profileSubjects={profileSubjects} />
  }

  if (variant === 'list') {
    return (
      <StudentTextbookListWithCategories
        studentId={studentId}
        profileSubjects={profileSubjects}
        textbooks={textbooks}
        initialSubject={initialSubject}
        editHref={editHref}
        totalTextbookCount={totalTextbookCount}
        totalAllTextbookCount={totalAllTextbookCount}
        currentPage={currentPage}
        pageSize={pageSize}
      />
    )
  }

  return (
    <StudentTextbookRegister
      studentId={studentId}
      profileSubjects={profileSubjects}
      catalog={catalog}
      registeredCatalogIds={registeredCatalogIds}
      initialSubject={initialSubject}
      editHref={editHref}
    />
  )
}
