'use server'

import { cookies } from 'next/headers'
import {
  FLASH_TOAST_COOKIE,
  FLASH_TOAST_COOKIE_OPTIONS,
  type FlashToastKind,
} from '@/lib/toast/flash-toast'

/** Server-only: set a one-shot flash toast cookie before redirect. */
export async function setFlashToastCookie(kind: FlashToastKind): Promise<void> {
  const jar = await cookies()
  jar.set(FLASH_TOAST_COOKIE, kind, FLASH_TOAST_COOKIE_OPTIONS)
}
