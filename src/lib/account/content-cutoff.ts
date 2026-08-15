const EPOCH = '1970-01-01T00:00:00.000Z'

export function isUnreadEligibleContent(
  contentCreatedAt: string,
  accountCreatedAt: string,
): boolean {
  return new Date(contentCreatedAt) >= new Date(accountCreatedAt)
}

export function adminUnreadCutoff(
  adminSince: string | null | undefined,
  accountCreatedAt: string,
): string {
  return adminSince ?? accountCreatedAt
}

export function unreadSinceTimestamp(
  lastReadAt: string | undefined,
  accountCreatedAt: string,
): string {
  const readSince = lastReadAt ?? EPOCH
  return new Date(readSince) >= new Date(accountCreatedAt) ? readSince : accountCreatedAt
}
