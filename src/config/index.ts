import type {
  QueueManagerConfig,
  RetryConfig,
  BackpressureConfig,
  CircuitBreakerConfig,
  RateLimitConfig,
} from '../types';

// ============================================================================
// Default Configurations
// ============================================================================

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  strategy: 'exponential',
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  jitter: true,
  retryOn: [408, 429, 500, 502, 503, 504],
};

export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  requestsPerSecond: 100,
  burstSize: 150,
};

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 3,
  resetTimeout: 30000,
  halfOpenMaxRequests: 3,
};

export const DEFAULT_BACKPRESSURE_CONFIG: BackpressureConfig = {
  maxConcurrency: 10,
  perHostConcurrency: 5,
  rateLimit: DEFAULT_RATE_LIMIT_CONFIG,
  circuitBreaker: DEFAULT_CIRCUIT_BREAKER_CONFIG,
};

export const DEFAULT_QUEUE_MANAGER_CONFIG: Required<Omit<QueueManagerConfig, 'redis' | 'postgres'>> = {
  concurrency: 10,
  retry: DEFAULT_RETRY_CONFIG,
  backpressure: DEFAULT_BACKPRESSURE_CONFIG,
  workerCount: 1,
  pollInterval: 100,
  gracefulShutdownTimeout: 30000,
};

// ============================================================================
// Redis Keys
// ============================================================================

export const REDIS_KEYS = {
  QUEUE: 'queue:pending',
  PROCESSING: 'queue:processing',
  SCHEDULED: 'queue:scheduled',
  DEAD_LETTER: 'queue:dead',
  REQUEST_PREFIX: 'request:',
  RATE_LIMIT_PREFIX: 'ratelimit:',
  CIRCUIT_BREAKER_PREFIX: 'cb:',
  LOCK_PREFIX: 'lock:',
  CHANNEL_NEW_REQUEST: 'channel:new-request',
  CHANNEL_RETRY: 'channel:retry',
} as const;

// ============================================================================
// Utility Functions
// ============================================================================

export function mergeConfig(userConfig: QueueManagerConfig): QueueManagerConfig & {
  retry: RetryConfig;
  backpressure: BackpressureConfig;
} {
  return {
    ...userConfig,
    concurrency: userConfig.concurrency ?? DEFAULT_QUEUE_MANAGER_CONFIG.concurrency,
    workerCount: userConfig.workerCount ?? DEFAULT_QUEUE_MANAGER_CONFIG.workerCount,
    pollInterval: userConfig.pollInterval ?? DEFAULT_QUEUE_MANAGER_CONFIG.pollInterval,
    gracefulShutdownTimeout:
      userConfig.gracefulShutdownTimeout ?? DEFAULT_QUEUE_MANAGER_CONFIG.gracefulShutdownTimeout,
    retry: {
      ...DEFAULT_RETRY_CONFIG,
      ...userConfig.retry,
    },
    backpressure: {
      ...DEFAULT_BACKPRESSURE_CONFIG,
      ...userConfig.backpressure,
      rateLimit: {
        ...DEFAULT_RATE_LIMIT_CONFIG,
        ...userConfig.backpressure?.rateLimit,
      },
      circuitBreaker: {
        ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
        ...userConfig.backpressure?.circuitBreaker,
      },
    },
  };
}
