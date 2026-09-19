/**
 * A narrow clock boundary for server-rendered operational views.
 * Keeping the current-time read outside a React render function preserves
 * React's rendering guarantees while retaining the existing live windows.
 */
export function currentEpochMilliseconds() {
  return Date.now();
}

export function isoBeforeNow(milliseconds: number) {
  return new Date(currentEpochMilliseconds() - milliseconds).toISOString();
}

export function isoNow() {
  return new Date(currentEpochMilliseconds()).toISOString();
}
