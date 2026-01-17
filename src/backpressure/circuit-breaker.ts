import type { CircuitBreakerConfig, CircuitBreakerState } from '../types';
import type { RedisStore } from '../storage/redis';

// ============================================================================
// Circuit Breaker
// ============================================================================

export class CircuitBreaker {
  private redis: RedisStore;
  private config: CircuitBreakerConfig;

  constructor(redis: RedisStore, config: CircuitBreakerConfig) {
    this.redis = redis;
    this.config = config;
  }

  /**
   * Checks if the circuit is allowing requests for a given host.
   */
  async isAllowed(host: string): Promise<{ allowed: boolean; state: CircuitBreakerState }> {
    const state = await this.redis.getCircuitBreakerState(host);

    switch (state.state) {
      case 'closed':
        return { allowed: true, state: 'closed' };

      case 'open': {
        // Check if reset timeout has passed
        if (state.stateChangedAt) {
          const elapsed = Date.now() - state.stateChangedAt.getTime();
          
          if (elapsed >= this.config.resetTimeout) {
            // Transition to half-open
            await this.redis.updateCircuitBreaker(host, {
              state: 'half-open',
              resetCounters: true,
            });
            return { allowed: true, state: 'half-open' };
          }
        }
        return { allowed: false, state: 'open' };
      }

      case 'half-open': {
        // Allow limited requests in half-open state
        if (state.successes + state.failures < this.config.halfOpenMaxRequests) {
          return { allowed: true, state: 'half-open' };
        }
        return { allowed: false, state: 'half-open' };
      }

      default:
        return { allowed: true, state: 'closed' };
    }
  }

  /**
   * Records a successful request.
   */
  async recordSuccess(host: string): Promise<void> {
    const state = await this.redis.getCircuitBreakerState(host);

    switch (state.state) {
      case 'half-open': {
        // Increment successes
        await this.redis.updateCircuitBreaker(host, { incrementSuccesses: true });

        // Check if we have enough successes to close the circuit
        if (state.successes + 1 >= this.config.successThreshold) {
          await this.redis.updateCircuitBreaker(host, {
            state: 'closed',
            resetCounters: true,
          });
        }
        break;
      }

      case 'closed': {
        // Reset failure count on success in closed state
        if (state.failures > 0) {
          await this.redis.updateCircuitBreaker(host, { resetCounters: true });
        }
        break;
      }
    }
  }

  /**
   * Records a failed request.
   */
  async recordFailure(host: string): Promise<void> {
    const state = await this.redis.getCircuitBreakerState(host);

    switch (state.state) {
      case 'closed': {
        // Increment failures
        await this.redis.updateCircuitBreaker(host, { incrementFailures: true });

        // Check if we should open the circuit
        if (state.failures + 1 >= this.config.failureThreshold) {
          await this.redis.updateCircuitBreaker(host, {
            state: 'open',
            resetCounters: true,
          });
        }
        break;
      }

      case 'half-open': {
        // Any failure in half-open state opens the circuit
        await this.redis.updateCircuitBreaker(host, {
          state: 'open',
          incrementFailures: true,
        });
        break;
      }
    }
  }

  /**
   * Gets the current state of the circuit breaker for a host.
   */
  async getState(host: string): Promise<{
    state: CircuitBreakerState;
    failures: number;
    successes: number;
    timeUntilReset?: number;
  }> {
    const cbState = await this.redis.getCircuitBreakerState(host);

    let timeUntilReset: number | undefined;

    if (cbState.state === 'open' && cbState.stateChangedAt) {
      const elapsed = Date.now() - cbState.stateChangedAt.getTime();
      timeUntilReset = Math.max(0, this.config.resetTimeout - elapsed);
    }

    return {
      state: cbState.state,
      failures: cbState.failures,
      successes: cbState.successes,
      timeUntilReset,
    };
  }

  /**
   * Manually resets the circuit breaker for a host.
   */
  async reset(host: string): Promise<void> {
    await this.redis.updateCircuitBreaker(host, {
      state: 'closed',
      resetCounters: true,
    });
  }
}
