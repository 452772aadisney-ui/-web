'use client'

import { ja } from 'date-fns/locale'
import { DayPicker, getDefaultClassNames, UI } from 'react-day-picker'
import { cn } from '@/lib/utils'
import 'react-day-picker/style.css'

export type CalendarProps = React.ComponentProps<typeof DayPicker>

const defaultClassNames = getDefaultClassNames()

function Calendar({ className, classNames, showOutsideDays = true, style, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      locale={ja}
      className={cn('schedule-calendar-picker w-full', className)}
      style={{
        width: '100%',
        ['--rdp-day-width' as string]: 'auto',
        ['--rdp-day-height' as string]: 'auto',
        ['--rdp-day_button-width' as string]: '100%',
        ['--rdp-day_button-height' as string]: 'auto',
        ...style,
      }}
      classNames={{
        ...defaultClassNames,
        [UI.Root]: cn(defaultClassNames[UI.Root], 'w-full'),
        [UI.Months]: cn(defaultClassNames[UI.Months], 'w-full !max-w-none'),
        [UI.Month]: cn(defaultClassNames[UI.Month], 'w-full'),
        [UI.MonthCaption]: cn(
          defaultClassNames[UI.MonthCaption],
          'relative flex w-full items-center justify-center',
        ),
        [UI.CaptionLabel]: cn(defaultClassNames[UI.CaptionLabel], 'text-base font-medium sm:text-sm'),
        [UI.PreviousMonthButton]: cn(
          defaultClassNames[UI.PreviousMonthButton],
          'absolute left-0 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-background sm:h-8 sm:w-8',
        ),
        [UI.NextMonthButton]: cn(
          defaultClassNames[UI.NextMonthButton],
          'absolute right-0 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-background sm:h-8 sm:w-8',
        ),
        [UI.MonthGrid]: cn(defaultClassNames[UI.MonthGrid], 'w-full table-fixed'),
        [UI.Weekday]: cn(defaultClassNames[UI.Weekday], 'text-muted text-xs sm:text-sm'),
        [UI.Day]: cn(defaultClassNames[UI.Day], 'p-0.5 text-center'),
        [UI.DayButton]: cn(
          defaultClassNames[UI.DayButton],
          'mx-auto aspect-square w-full max-w-none rounded-lg text-sm font-normal transition hover:bg-background',
        ),
        ...classNames,
      }}
      {...props}
    />
  )
}

export { Calendar }
