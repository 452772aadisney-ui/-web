import { afterEach, describe, expect, it, vi } from 'vitest'

const { dismissMock, successMock, errorMock } = vi.hoisted(() => ({
  dismissMock: vi.fn(),
  successMock: vi.fn(),
  errorMock: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    dismiss: dismissMock,
    success: successMock,
    error: errorMock,
  },
}))

import {
  APP_TOAST_DURATION_MS,
  APP_TOAST_SAFE_ERROR_MESSAGE,
  __resetToastGenerationForTests,
  createToastSession,
  getToastGeneration,
  invalidateToastsOnNavigation,
  notifyError,
  notifySuccess,
} from '@/lib/toast/app-toast'

describe('app-toast', () => {
  afterEach(() => {
    dismissMock.mockClear()
    successMock.mockClear()
    errorMock.mockClear()
    __resetToastGenerationForTests()
  })

  it('uses a shared 2 second duration for success and error', () => {
    expect(APP_TOAST_DURATION_MS).toBe(2000)

    notifySuccess('保存しました')
    notifyError()

    expect(successMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        duration: 2000,
        closeButton: false,
        id: 'app-toast-success',
      }),
    )
    expect(errorMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        duration: 2000,
        closeButton: false,
        id: 'app-toast-error',
      }),
    )
    expect(errorMock.mock.calls[0]?.[0]).toMatchObject({
      props: { role: 'alert', children: APP_TOAST_SAFE_ERROR_MESSAGE },
    })
    expect(successMock.mock.calls[0]?.[0]).toMatchObject({
      props: { role: 'status', children: '保存しました' },
    })
  })

  it('dismisses toasts and invalidates sessions on navigation', () => {
    const session = createToastSession()
    const generationBefore = getToastGeneration()

    invalidateToastsOnNavigation()

    expect(dismissMock).toHaveBeenCalledTimes(1)
    expect(getToastGeneration()).toBe(generationBefore + 1)

    session.success('古い成功')
    session.error('古い失敗')

    expect(successMock).not.toHaveBeenCalled()
    expect(errorMock).not.toHaveBeenCalled()
  })

  it('allows a new session after navigation to show toasts', () => {
    const stale = createToastSession()
    invalidateToastsOnNavigation()
    const fresh = createToastSession()

    stale.success('遷移前')
    fresh.success('遷移後', 'fresh-success')

    expect(successMock).toHaveBeenCalledTimes(1)
    expect(successMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'fresh-success' }),
    )
  })
})
