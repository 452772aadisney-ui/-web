import { describe, expect, it } from 'vitest'
import { shouldCloseDialogForActionSuccess } from '@/lib/coaching/coach-dialog-success'

describe('shouldCloseDialogForActionSuccess', () => {
  it('closes only after a real submit succeeded while open', () => {
    expect(
      shouldCloseDialogForActionSuccess({
        open: true,
        pending: false,
        success: true,
        allowClose: true,
      }),
    ).toBe(true)
  })

  it('does not close on stale success when reopen has not submitted', () => {
    expect(
      shouldCloseDialogForActionSuccess({
        open: true,
        pending: false,
        success: true,
        allowClose: false,
      }),
    ).toBe(false)
  })

  it('does not close while pending or when closed', () => {
    expect(
      shouldCloseDialogForActionSuccess({
        open: true,
        pending: true,
        success: true,
        allowClose: true,
      }),
    ).toBe(false)
    expect(
      shouldCloseDialogForActionSuccess({
        open: false,
        pending: false,
        success: true,
        allowClose: true,
      }),
    ).toBe(false)
  })

  it('does not close on failure', () => {
    expect(
      shouldCloseDialogForActionSuccess({
        open: true,
        pending: false,
        success: undefined,
        allowClose: true,
      }),
    ).toBe(false)
  })
})
