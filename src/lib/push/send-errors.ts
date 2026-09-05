export type PushDeliveryErrorCode =
  | 'gone'
  | 'transient'
  | 'client_error'
  | 'timeout'
  | 'network'
  | 'unknown'

export type ClassifiedPushSendError = {
  httpStatus: number | null
  errorCode: PushDeliveryErrorCode
  shouldDisableSubscription: boolean
}

/**
 * Classify web-push / HTTP failures without retaining response bodies or secrets.
 */
export function classifyPushSendFailure(error: unknown): ClassifiedPushSendError {
  const status =
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof (error as { statusCode: unknown }).statusCode === 'number'
      ? (error as { statusCode: number }).statusCode
      : null

  if (status === 404 || status === 410) {
    return {
      httpStatus: status,
      errorCode: 'gone',
      shouldDisableSubscription: true,
    }
  }

  if (status === 429) {
    return {
      httpStatus: status,
      errorCode: 'transient',
      shouldDisableSubscription: false,
    }
  }

  if (status !== null && status >= 500) {
    return {
      httpStatus: status,
      errorCode: 'transient',
      shouldDisableSubscription: false,
    }
  }

  if (status !== null && status >= 400) {
    return {
      httpStatus: status,
      errorCode: 'client_error',
      shouldDisableSubscription: false,
    }
  }

  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : typeof error === 'string'
        ? error.toLowerCase()
        : ''

  if (message.includes('timeout') || message.includes('timed out')) {
    return {
      httpStatus: null,
      errorCode: 'timeout',
      shouldDisableSubscription: false,
    }
  }

  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('econn') ||
    message.includes('enotfound')
  ) {
    return {
      httpStatus: null,
      errorCode: 'network',
      shouldDisableSubscription: false,
    }
  }

  return {
    httpStatus: status,
    errorCode: 'unknown',
    shouldDisableSubscription: false,
  }
}
