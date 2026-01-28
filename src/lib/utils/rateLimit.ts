type RateLimitState = {
  tokens: number;
  lastRefillMs: number;
};

const bucket = new Map<string, RateLimitState>();

/**
 * Простейший token-bucket rate limit на инстанс.
 * Подходит для личного использования в одном инстансе.
 */
export function rateLimit(
  key: string,
  options: { maxTokens: number; refillPerSecond: number }
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const state = bucket.get(key) || { tokens: options.maxTokens, lastRefillMs: now };
  const elapsed = (now - state.lastRefillMs) / 1000;
  const refill = elapsed * options.refillPerSecond;
  const newTokens = Math.min(options.maxTokens, state.tokens + refill);
  const allowed = newTokens >= 1;
  const updated: RateLimitState = {
    tokens: allowed ? newTokens - 1 : newTokens,
    lastRefillMs: now,
  };
  bucket.set(key, updated);
  const retryAfterSec = allowed ? 0 : Math.ceil((1 - newTokens) / options.refillPerSecond);
  return { allowed, retryAfterSec };
}

