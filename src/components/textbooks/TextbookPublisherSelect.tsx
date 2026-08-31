'use client'

import { useState } from 'react'
import { inputClass } from '@/components/textbooks/TextbookFormFields'

const CUSTOM_PUBLISHER_VALUE = '__custom_publisher__'

interface TextbookPublisherSelectProps {
  publishers: string[]
  defaultPublisher?: string | null
}

function resolveInitialState(publishers: string[], defaultPublisher?: string | null) {
  const trimmed = defaultPublisher?.trim() ?? ''
  if (!trimmed) {
    return { selected: '', customValue: '' }
  }
  if (publishers.includes(trimmed)) {
    return { selected: trimmed, customValue: '' }
  }
  return { selected: CUSTOM_PUBLISHER_VALUE, customValue: trimmed }
}

export function TextbookPublisherSelect({
  publishers,
  defaultPublisher,
}: TextbookPublisherSelectProps) {
  const initial = resolveInitialState(publishers, defaultPublisher)
  const [selected, setSelected] = useState(initial.selected)
  const [customValue, setCustomValue] = useState(initial.customValue)

  const showCustomInput = selected === CUSTOM_PUBLISHER_VALUE

  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">出版社</span>
      <select
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
        className={inputClass}
      >
        <option value="">選択してください</option>
        {publishers.map((publisher) => (
          <option key={publisher} value={publisher}>
            {publisher}
          </option>
        ))}
        <option value={CUSTOM_PUBLISHER_VALUE}>新規入力（直接入力）</option>
      </select>

      {showCustomInput ? (
        <input
          type="text"
          name="publisher"
          value={customValue}
          onChange={(event) => setCustomValue(event.target.value)}
          required
          placeholder="出版社名を入力"
          className={`${inputClass} mt-2`}
        />
      ) : selected ? (
        <input type="hidden" name="publisher" value={selected} />
      ) : null}

      <p className="mt-1 text-xs text-muted">
        リストにない出版社は「新規入力」から追加できます。保存すると次回からプルダウンに表示されます。
      </p>
    </label>
  )
}
