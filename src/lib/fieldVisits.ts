export function isValidVisitSummary(value: string): boolean {
  return typeof value === 'string' && value.trim().length >= 3 && value.length <= 3000;
}

export function normalizeVisitAssignment(role: string, userUid: string, requestedUid: string): string {
  return role === 'pendamping' ? userUid : (requestedUid.trim() || userUid);
}
