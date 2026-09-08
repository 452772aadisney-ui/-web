/**
 * Decide whether a create/edit dialog should auto-close after an action success.
 *
 * Success must not reopen-close: only a submission that flipped `pending` to true
 * in this mount (`allowClose`) may close. Stale `state.success` after cancel/reopen
 * must not close the dialog.
 */
export function shouldCloseDialogForActionSuccess(options: {
  open: boolean
  pending: boolean
  success?: boolean
  allowClose: boolean
}): boolean {
  const { open, pending, success, allowClose } = options
  return Boolean(open && !pending && success && allowClose)
}
