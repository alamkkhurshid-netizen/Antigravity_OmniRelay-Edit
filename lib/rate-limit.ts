interface RateLimitTracker {
  count: number;
  resetAt: number;
}

const rateLimiters = new Map<string, RateLimitTracker>();

export function checkRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  let tracker = rateLimiters.get(key);

  if (!tracker || tracker.resetAt < now) {
    tracker = { count: 0, resetAt: now + windowMs };
  }

  tracker.count += 1;
  rateLimiters.set(key, tracker);

  // Periodically clean up old keys to prevent memory leaks in long-running processes
  if (Math.random() < 0.01) {
    for (const [k, v] of rateLimiters.entries()) {
      if (v.resetAt < now) {
        rateLimiters.delete(k);
      }
    }
  }

  const success = tracker.count <= limit;
  const remaining = Math.max(0, limit - tracker.count);

  return {
    success,
    limit,
    remaining,
    reset: tracker.resetAt,
  };
}
