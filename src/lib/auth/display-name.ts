/** UI 表示用の名前（氏名のみ。表示名は使わない） */
export function getPersonName(person: {
  full_name: string
  display_name?: string | null
}): string {
  return person.full_name?.trim() || '名前未設定'
}
