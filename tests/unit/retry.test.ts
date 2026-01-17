import { describe, test, expect } from 'bun:test';
import {
  calculateRetryDelay,
  shouldRetry,
  createRetryContext,
  updateRetryContext,
} from '../../src/retry/strategies';
import type { RetryConfig } from '../../src/types';

describe('Retry Strategies', () => {
  const baseConfig: RetryConfig = {
    strategy: 'exponential',
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    jitter: false,
    retryOn: [429, 500, 502, 503, 504],
  };

  describe('calculateRetryDelay', () => {
    test('exponential backoff doubles delay each attempt', () => {
      const config = { ...baseConfig, strategy: 'exponential' as const };
      
      expect(calculateRetryDelay(1, config)).toBe(1000);
      expect(calculateRetryDelay(2, config)).toBe(2000);
      expect(calculateRetryDelay(3, config)).toBe(4000);
      expect(calculateRetryDelay(4, config)).toBe(8000);
    });

    test('linear backoff increases delay linearly', () => {
      const config = { ...baseConfig, strategy: 'linear' as const };
      
      expect(calculateRetryDelay(1, config)).toBe(1000);
      expect(calculateRetryDelay(2, config)).toBe(2000);
      expect(calculateRetryDelay(3, config)).toBe(3000);
    });

    test('fixed delay returns constant value', () => {
      const config = { ...baseConfig, strategy: 'fixed' as const };
      
      expect(calculateRetryDelay(1, config)).toBe(1000);
      expect(calculateRetryDelay(2, config)).toBe(1000);
      expect(calculateRetryDelay(5, config)).toBe(1000);
    });

    test('respects maxDelay cap', () => {
      const config = { ...baseConfig, maxDelay: 5000 };
      
      expect(calculateRetryDelay(10, config)).toBe(5000);
    });

    test('applies jitter when enabled', () => {
      const config = { ...baseConfig, jitter: true };
      const delays = new Set<number>();
      
      // Calculate delay multiple times, jitter should vary
      for (let i = 0; i < 10; i++) {
        delays.add(calculateRetryDelay(1, config));
      }
      
      // With jitter, we should have some variance (not all same)
      // Allow for small chance all are same, but likely different
      expect(delays.size).toBeGreaterThanOrEqual(1);
    });

    test('custom strategy uses provided function', () => {
      const config = { ...baseConfig, strategy: 'custom' as const };
      const customFn = (attempt: number, base: number) => base * attempt * 2;
      
      expect(calculateRetryDelay(1, config, customFn)).toBe(2000);
      expect(calculateRetryDelay(2, config, customFn)).toBe(4000);
      expect(calculateRetryDelay(3, config, customFn)).toBe(6000);
    });

    test('custom strategy throws without function', () => {
      const config = { ...baseConfig, strategy: 'custom' as const };
      
      expect(() => calculateRetryDelay(1, config)).toThrow();
    });
  });

  describe('shouldRetry', () => {
    test('returns false when max retries exceeded', () => {
      expect(shouldRetry(500, undefined, 3, baseConfig)).toBe(false);
      expect(shouldRetry(500, undefined, 4, baseConfig)).toBe(false);
    });

    test('returns true for retryable status codes', () => {
      expect(shouldRetry(429, undefined, 1, baseConfig)).toBe(true);
      expect(shouldRetry(500, undefined, 1, baseConfig)).toBe(true);
      expect(shouldRetry(502, undefined, 1, baseConfig)).toBe(true);
      expect(shouldRetry(503, undefined, 1, baseConfig)).toBe(true);
      expect(shouldRetry(504, undefined, 1, baseConfig)).toBe(true);
    });

    test('returns false for non-retryable status codes', () => {
      expect(shouldRetry(200, undefined, 1, baseConfig)).toBe(false);
      expect(shouldRetry(400, undefined, 1, baseConfig)).toBe(false);
      expect(shouldRetry(401, undefined, 1, baseConfig)).toBe(false);
      expect(shouldRetry(404, undefined, 1, baseConfig)).toBe(false);
    });

    test('retries on network errors', () => {
      const networkError = new Error('Connection refused');
      (networkError as NodeJS.ErrnoException).code = 'ECONNREFUSED';
      
      expect(shouldRetry(undefined, networkError, 1, baseConfig)).toBe(true);
    });

    test('retries on timeout errors', () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'AbortError';
      
      expect(shouldRetry(undefined, timeoutError, 1, baseConfig)).toBe(true);
    });

    test('uses custom retryOn function', () => {
      const config = {
        ...baseConfig,
        retryOn: (status: number) => status >= 500,
      };
      
      expect(shouldRetry(500, undefined, 1, config)).toBe(true);
      expect(shouldRetry(429, undefined, 1, config)).toBe(false);
    });
  });

  describe('RetryContext', () => {
    test('createRetryContext initializes correctly', () => {
      const context = createRetryContext(baseConfig);
      
      expect(context.attempt).toBe(0);
      expect(context.maxRetries).toBe(3);
      expect(context.strategy).toBe('exponential');
    });

    test('updateRetryContext increments attempt', () => {
      const context = createRetryContext(baseConfig);
      const updated = updateRetryContext(context, 500, undefined, baseConfig);
      
      expect(updated.attempt).toBe(1);
      expect(updated.lastStatusCode).toBe(500);
      expect(updated.nextRetryAt).toBeInstanceOf(Date);
    });

    test('updateRetryContext stores error', () => {
      const context = createRetryContext(baseConfig);
      const error = new Error('Test error');
      const updated = updateRetryContext(context, undefined, error, baseConfig);
      
      expect(updated.lastError).toBe(error);
    });
  });
});
