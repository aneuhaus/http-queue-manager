import type { RateLimitConfig } from '../types';
import type { RedisStore } from '../storage/redis';

// ============================================================================
// Token Bucket Rate Limiter
// ============================================================================

export class RateLimiter {
  private redis: RedisStore;
  private config: Required<RateLimitConfig>;
  private globalKey = 'global';

  constructor(redis: RedisStore, config: RateLimitConfig) {
    this.redis = redis;
    this.config = {
      requestsPerSecond: config.requestsPerSecond ?? 100,
      requestsPerMinute: config.requestsPerMinute ?? 6000,
      burstSize: config.burstSize ?? Math.ceil((config.requestsPerSecond ?? 100) * 1.5),
    };
  }

  /**
   * Attempts to acquire a token for making a request.
   * Returns true if allowed, false if rate limited.
   */
  async acquire(host?: string): Promise<{ allowed: boolean; retryAfter?: number }> {
    // Check global rate limit first
    const globalResult = await this.redis.checkRateLimit(
      this.globalKey,
      this.config.requestsPerSecond,
      this.config.burstSize
    );

    if (!globalResult.allowed) {
      return globalResult;
    }

    // Check per-host rate limit if host is provided
    if (host) {
      const hostResult = await this.redis.checkRateLimit(
        `host:${host}`,
        Math.ceil(this.config.requestsPerSecond / 10), // 10% of global for per-host
        Math.ceil(this.config.burstSize / 5)
      );

      if (!hostResult.allowed) {
        return hostResult;
      }
    }

    return { allowed: true };
  }

  /**
   * Waits until a token is available.
   */
  async waitForToken(host?: string, maxWaitMs = 30000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const result = await this.acquire(host);

      if (result.allowed) {
        return true;
      }

      // Wait for the suggested retry time
      const waitTime = Math.min(result.retryAfter ?? 100, maxWaitMs - (Date.now() - startTime));
      
      if (waitTime <= 0) {
        return false;
      }

      await Bun.sleep(waitTime);
    }

    return false;
  }
}
