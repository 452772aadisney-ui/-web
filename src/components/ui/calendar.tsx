'use client'

import { ja } from 'date-fns/locale'
import { DayPicker } from 'react-day-picker'
import { cn } from '@/lib/utils'
import 'react-day-picker/style.css'

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      locale={ja}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row gap-4',
        month: 'flex flex-col gap-4',
        month_caption: 'flex justify-center pt-1 relative items-center w-full',
        caption_label: 'text-sm font-medium',
        nav: 'flex items-center gap-1',
        button_previous: cn(
          'absolute left-1 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-background',
        ),
        button_next: cn(
          'absolute right-1 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-background',
        ),
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'text-muted w-9 font-normal text-[0.8rem] text-center',
        week: 'flex w-full mt-1',
        day: 'relative p-0 text-center',
        day_button: cn(
          'inline-flex h-9 w-9 items-center justify-center rounded-lg p-0 text-sm font-normal transition hover:bg-background aria-selected:opacity-100',
        ),
        selected:
          'bg-primary text-white hover:bg-primary hover:text-white focus:bg-primary focus:text-white rounded-lg',
        today: 'bg-blue-50 text-primary font-semibold rounded-lg',
        outside: 'text-muted opacity-40',
        disabled: 'text-muted opacity-30',
        hidden: 'invisible',
        ...classNames,
      }}
      {...props}
    />
  )
}

export { Calendar }
