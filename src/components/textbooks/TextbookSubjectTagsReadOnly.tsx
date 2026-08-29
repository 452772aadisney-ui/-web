interface TextbookSubjectTagsReadOnlyProps {
  detailTags: string[]
  subjects: string[]
}

export function TextbookSubjectTagsReadOnly({
  detailTags,
  subjects,
}: TextbookSubjectTagsReadOnlyProps) {
  const displayTags = detailTags.length > 0 ? detailTags : subjects

  return (
    <div className="rounded-lg border border-border bg-background px-3 py-3">
      <p className="text-sm font-medium">科目タグ</p>
      <p className="mt-1 text-xs text-muted">マスタ登録の参考書のため変更できません</p>
      {displayTags.length > 0 ? (
        <p className="mt-2 text-sm">{displayTags.join('・')}</p>
      ) : (
        <p className="mt-2 text-sm text-muted">未設定</p>
      )}
    </div>
  )
}
