'use client'

import { useId, useState } from 'react'
import { cn } from '@/lib/utils'

interface PasswordInputProps {
  name: string
  label: string
  autoComplete?: string
  required?: boolean
  minLength?: number
  placeholder?: string
  className?: string
}

export function PasswordInput({
  name,
  label,
  autoComplete,
  required,
  minLength,
  placeholder,
  className,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false)
  const inputId = useId()

  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <div className="relative">
        <input
          id={inputId}
          type={visible ? 'text' : 'password'}
          name={name}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          placeholder={placeholder}
          className="w-full rounded-lg border border-border bg-background py-2.5 pl-3 pr-11 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-muted hover:text-foreground"
          aria-label={visible ? 'パスワードを非表示' : 'パスワードを表示'}
          aria-controls={inputId}
        >
          {visible ? '非表示' : '表示'}
        </button>
      </div>
    </label>
  )
}
