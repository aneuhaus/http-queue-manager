import type { RetryConfig, CustomRetryFn, RetryStrategyType } from '../types';

// ============================================================================
// Retry Strategy Calculator
// ============================================================================

/**
 * Calculates the delay before the next retry attempt.
 */
export function calculateRetryDelay(
  attempt: number,
  config: RetryConfig,
  customFn?: CustomRetryFn
): number {
  let delay: number;

  switch (config.strategy) {
    case 'exponential':
      delay = exponentialBackoff(attempt, config.baseDelay, config.maxDelay);
      break;
    case 'linear':
      delay = linearBackoff(attempt, config.baseDelay, config.maxDelay);
      break;
    case 'fixed':
      delay = config.baseDelay;
      break;
    case 'custom':
      if (!customFn) {
        throw new Error('Custom retry strategy requires a custom function');
      }
      delay = customFn(attempt, config.baseDelay, config.maxDelay);
      break;
    default:
      delay = config.baseDelay;
  }

  // Apply jitter if enabled (±25% randomization)
  if (config.jitter) {
    delay = applyJitter(delay);
  }

  return Math.min(delay, config.maxDelay);
}

/**
 * Exponential backoff: delay * 2^attempt
 */
function exponentialBackoff(
  attempt: number,
  baseDelay: number,
  maxDelay: number
): number {
  return Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
}

/**
 * Linear backoff: delay * attempt
 */
function linearBackoff(
  attempt: number,
  baseDelay: number,
  maxDelay: number
): number {
  return Math.min(baseDelay * attempt, maxDelay);
}

/**
 * Applies jitter to a delay (±25% randomization)
 */
function applyJitter(delay: number): number {
  const jitterRange = delay * 0.25;
  const jitter = (Math.random() * 2 - 1) * jitterRange;
  return Math.max(0, Math.round(delay + jitter));
}

// ============================================================================
// Retry Decision Logic
// ============================================================================

/**
 * Determines if a request should be retried based on the response/error.
 */
export function shouldRetry(
  statusCode: number | undefined,
  error: Error | undefined,
  attempt: number,
  config: RetryConfig
): boolean {
  // Check if max retries exceeded
  if (attempt >= config.maxRetries) {
    return false;
  }

  // Network errors should typically be retried
  if (error && !statusCode) {
    const retryableErrors = [
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'EAI_AGAIN',
      'EPIPE',
      'EHOSTUNREACH',
      'ENETUNREACH',
    ];

    const errorCode = (error as NodeJS.ErrnoException).code;
    if (errorCode && retryableErrors.includes(errorCode)) {
      return true;
    }

    // Timeout errors
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      return true;
    }
  }

  // No status code and no retryable error
  if (!statusCode) {
    return false;
  }

  // Check if status code is retryable
  if (typeof config.retryOn === 'function') {
    return config.retryOn(statusCode, error);
  }

  if (Array.isArray(config.retryOn)) {
    return config.retryOn.includes(statusCode);
  }

  // Default retryable status codes
  const defaultRetryableCodes = [408, 429, 500, 502, 503, 504];
  return defaultRetryableCodes.includes(statusCode);
}

// ============================================================================
// Retry Context
// ============================================================================

export interface RetryContext {
  attempt: number;
  maxRetries: number;
  lastError?: Error;
  lastStatusCode?: number;
  nextRetryAt?: Date;
  strategy: RetryStrategyType;
}

/**
 * Creates a new retry context for a request.
 */
export function createRetryContext(config: RetryConfig): RetryContext {
  return {
    attempt: 0,
    maxRetries: config.maxRetries,
    strategy: config.strategy,
  };
}

/**
 * Updates retry context after a failed attempt.
 */
export function updateRetryContext(
  context: RetryContext,
  statusCode: number | undefined,
  error: Error | undefined,
  config: RetryConfig,
  customFn?: CustomRetryFn
): RetryContext {
  const newAttempt = context.attempt + 1;
  
  const delay = calculateRetryDelay(newAttempt, config, customFn);
  const nextRetryAt = new Date(Date.now() + delay);

  return {
    ...context,
    attempt: newAttempt,
    lastError: error,
    lastStatusCode: statusCode,
    nextRetryAt,
  };
}

// ============================================================================
// Exports
// ============================================================================

export {
  exponentialBackoff,
  linearBackoff,
  applyJitter,
};
