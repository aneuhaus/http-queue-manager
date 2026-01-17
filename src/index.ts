// ============================================================================
// HTTP Queue Manager
// A TypeScript library for managing HTTP request queues with retry and
// backpressure features, using Redis and PostgreSQL.
// ============================================================================

// Main entry point
export { QueueManager, createQueueManager } from './core/queue-manager';

// Types
export type {
  // Request types
  QueueRequest,
  QueueRequestInput,
  QueueResponse,
  HttpMethod,
  
  // State types
  RequestState,
  RequestStatus,
  
  // Configuration types
  QueueManagerConfig,
  RetryConfig,
  RetryStrategyType,
  BackpressureConfig,
  RateLimitConfig,
  CircuitBreakerConfig,
  CircuitBreakerState,
  
  // Result types
  EnqueueResult,
  QueueStats,
  
  // Event types
  QueueEvent,
  QueueEventType,
  QueueEventHandler,
  
  // Storage types
  StoredRequest,
  RequestAttempt,
  
  // Utility types
  CustomRetryFn,
} from './types';

// Retry utilities (for custom implementations)
export {
  calculateRetryDelay,
  shouldRetry,
  createRetryContext,
  updateRetryContext,
  type RetryContext,
} from './retry';

// Backpressure components (for advanced usage)
export { BackpressureController } from './backpressure';
export { RateLimiter } from './backpressure/rate-limiter';
export { CircuitBreaker } from './backpressure/circuit-breaker';

// Storage components (for direct access if needed)
export { RedisStore } from './storage/redis';
export { PostgresStore } from './storage/postgres';

// Configuration utilities
export { mergeConfig, DEFAULT_RETRY_CONFIG, DEFAULT_BACKPRESSURE_CONFIG } from './config';
