import { describe, it, expect } from 'vitest';
import { rateLimit } from '@/lib/utils/rateLimit';

describe('rateLimit', () => {
  it('should allow initial tokens', () => {
    const result = rateLimit('test-user', { maxTokens: 2, refillPerSecond: 1 });
    expect(result.allowed).toBe(true);
  });

  it('should block when tokens exhausted', () => {
    const key = 'test-user-2';
    rateLimit(key, { maxTokens: 1, refillPerSecond: 0 });
    const result = rateLimit(key, { maxTokens: 1, refillPerSecond: 0 });
    expect(result.allowed).toBe(false);
  });
});

