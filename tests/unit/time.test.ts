import { describe, it, expect } from 'vitest';
import { formatUserTime, formatUserIso } from '@/lib/utils/time';

describe('time utils', () => {
  it('should format time string', () => {
    const result = formatUserTime('Europe/Moscow', new Date('2026-01-01T00:00:00Z'));
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should format ISO-like string', () => {
    const result = formatUserIso('Europe/Moscow', new Date('2026-01-01T00:00:00Z'));
    expect(result).toMatch(/T/);
  });
});

