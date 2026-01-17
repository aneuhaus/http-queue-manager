import type { BackpressureConfig, CircuitBreakerState } from '../types';
import type { RedisStore } from '../storage/redis';
import { RateLimiter } from './rate-limiter';
import { CircuitBreaker } from './circuit-breaker';

// ============================================================================
// Backpressure Controller
// ============================================================================

/**
 * Orchestrates all backpressure mechanisms: concurrency, rate limiting, and circuit breaking.
 */
export class BackpressureController {
  private config: BackpressureConfig;
  private rateLimiter: RateLimiter;
  private circuitBreaker: CircuitBreaker;
  private activeRequests: Map<string, number> = new Map();
  private totalActive = 0;

  constructor(redis: RedisStore, config: BackpressureConfig) {
    this.config = config;

    this.rateLimiter = new RateLimiter(redis, config.rateLimit ?? {});
    this.circuitBreaker = new CircuitBreaker(
      redis,
      config.circuitBreaker ?? {
        failureThreshold: 5,
        successThreshold: 3,
        resetTimeout: 30000,
        halfOpenMaxRequests: 3,
      }
    );
  }

  /**
   * Checks if a request to the given host can proceed.
   * Returns immediately without blocking.
   */
  async canProceed(host: string): Promise<{
    allowed: boolean;
    reason?: 'concurrency' | 'rate-limit' | 'circuit-open';
    retryAfter?: number;
  }> {
    // Check global concurrency
    if (this.totalActive >= this.config.maxConcurrency) {
      return { allowed: false, reason: 'concurrency' };
    }

    // Check per-host concurrency
    if (this.config.perHostConcurrency) {
      const hostActive = this.activeRequests.get(host) ?? 0;
      if (hostActive >= this.config.perHostConcurrency) {
        return { allowed: false, reason: 'concurrency' };
      }
    }

    // Check circuit breaker
    const cbResult = await this.circuitBreaker.isAllowed(host);
    if (!cbResult.allowed) {
      const state = await this.circuitBreaker.getState(host);
      return {
        allowed: false,
        reason: 'circuit-open',
        retryAfter: state.timeUntilReset,
      };
    }

    // Check rate limit
    const rlResult = await this.rateLimiter.acquire(host);
    if (!rlResult.allowed) {
      return {
        allowed: false,
        reason: 'rate-limit',
        retryAfter: rlResult.retryAfter,
      };
    }

    return { allowed: true };
  }

  /**
   * Waits until a request to the given host can proceed.
   * Respects all backpressure mechanisms.
   */
  async waitForSlot(host: string, maxWaitMs = 30000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const result = await this.canProceed(host);

      if (result.allowed) {
        return true;
      }

      // Calculate wait time based on reason
      let waitTime: number;

      switch (result.reason) {
        case 'rate-limit':
          waitTime = result.retryAfter ?? 100;
          break;
        case 'circuit-open':
          waitTime = result.retryAfter ?? 1000;
          break;
        case 'concurrency':
          waitTime = 50; // Poll frequently for concurrency
          break;
        default:
          waitTime = 100;
      }

      const remainingTime = maxWaitMs - (Date.now() - startTime);
      if (waitTime > remainingTime) {
        return false;
      }

      await Bun.sleep(Math.min(waitTime, remainingTime));
    }

    return false;
  }

  /**
   * Marks a request as started for the given host.
   */
  acquire(host: string): void {
    this.totalActive++;
    this.activeRequests.set(host, (this.activeRequests.get(host) ?? 0) + 1);
  }

  /**
   * Marks a request as completed for the given host.
   */
  release(host: string): void {
    this.totalActive = Math.max(0, this.totalActive - 1);
    
    const current = this.activeRequests.get(host) ?? 1;
    if (current <= 1) {
      this.activeRequests.delete(host);
    } else {
      this.activeRequests.set(host, current - 1);
    }
  }

  /**
   * Records a successful request for circuit breaker.
   */
  async recordSuccess(host: string): Promise<void> {
    await this.circuitBreaker.recordSuccess(host);
  }

  /**
   * Records a failed request for circuit breaker.
   */
  async recordFailure(host: string): Promise<void> {
    await this.circuitBreaker.recordFailure(host);
  }

  /**
   * Gets the current backpressure state.
   */
  getState(): {
    totalActive: number;
    maxConcurrency: number;
    activeByHost: Record<string, number>;
  } {
    return {
      totalActive: this.totalActive,
      maxConcurrency: this.config.maxConcurrency,
      activeByHost: Object.fromEntries(this.activeRequests),
    };
  }

  /**
   * Gets circuit breaker state for a specific host.
   */
  async getCircuitBreakerState(host: string): Promise<{
    state: CircuitBreakerState;
    failures: number;
    successes: number;
    timeUntilReset?: number;
  }> {
    return this.circuitBreaker.getState(host);
  }

  /**
   * Resets circuit breaker for a specific host.
   */
  async resetCircuitBreaker(host: string): Promise<void> {
    await this.circuitBreaker.reset(host);
  }
}
