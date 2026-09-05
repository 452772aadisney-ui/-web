/** Server/client-safe Push env helpers. Never expose private keys. */

export function getVapidPublicKey(): string | null {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
  return key && key.length > 0 ? key : null
}

/** Sending is allowed only when the string is exactly `true` (no trim / case fold). */
export function isPushSendingEnabled(): boolean {
  return process.env.PUSH_SENDING_ENABLED === 'true'
}

export function getVapidSubject(): string | null {
  const subject = process.env.VAPID_SUBJECT?.trim()
  return subject && subject.length > 0 ? subject : null
}

/** True when the browser-facing VAPID public key is configured. */
export function isPushConfigured(): boolean {
  return getVapidPublicKey() !== null
}
