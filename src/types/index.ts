import { z } from 'zod';

// ============================================================================
// Request Types
// ============================================================================

export const HttpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
export type HttpMethod = z.infer<typeof HttpMethodSchema>;

export const QueueRequestSchema = z.object({
  id: z.string().uuid().optional(),
  url: z.string().url(),
  method: HttpMethodSchema,
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
  priority: z.number().int().min(0).max(100).default(50),
  maxRetries: z.number().int().min(0).optional(),
  timeout: z.number().int().min(0).optional(),
  scheduledFor: z.date().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type QueueRequestInput = z.input<typeof QueueRequestSchema>;
export type QueueRequest = z.infer<typeof QueueRequestSchema> & {
  id: string;
  createdAt: Date;
};

export interface QueueResponse {
  requestId: string;
  status: number;
  headers: Record<string, string>;
  body: unknown;
  duration: number;
  attempt: number;
  completedAt: Date;
}

// ============================================================================
// State Types
// ============================================================================

export type RequestStatus = 
  | 'pending'
  | 'scheduled'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'dead'
  | 'cancelled';

export interface RequestState {
  id: string;
  request: QueueRequest;
  status: RequestStatus;
  attempts: number;
  lastAttemptAt?: Date;
  nextRetryAt?: Date;
  error?: string;
  response?: QueueResponse;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Retry Types
// ============================================================================

export type RetryStrategyType = 'exponential' | 'linear' | 'fixed' | 'custom';

export interface RetryConfig {
  strategy: RetryStrategyType;
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  jitter: boolean;
  retryOn?: number[] | ((status: number, error?: Error) => boolean);
}

export type CustomRetryFn = (attempt: number, baseDelay: number, maxDelay: number) => number;

// ============================================================================
// Backpressure Types
// ============================================================================

export interface RateLimitConfig {
  requestsPerSecond?: number;
  requestsPerMinute?: number;
  burstSize?: number;
}

export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  resetTimeout: number;
  halfOpenMaxRequests: number;
}

export interface BackpressureConfig {
  maxConcurrency: number;
  perHostConcurrency?: number;
  rateLimit?: RateLimitConfig;
  circuitBreaker?: CircuitBreakerConfig;
}

// ============================================================================
// Queue Manager Types
// ============================================================================

export interface QueueManagerConfig {
  redis: {
    url?: string;
    host?: string;
    port?: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
  };
  postgres: {
    connectionString?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    ssl?: boolean;
    poolSize?: number;
  };
  concurrency?: number;
  retry?: Partial<RetryConfig>;
  backpressure?: Partial<BackpressureConfig>;
  workerCount?: number;
  pollInterval?: number;
  gracefulShutdownTimeout?: number;
}

export interface EnqueueResult {
  id: string;
  position?: number;
}

export interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  dead: number;
  avgProcessingTime: number;
  successRate: number;
}

// ============================================================================
// Event Types
// ============================================================================

export type QueueEventType = 
  | 'enqueued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'retrying'
  | 'dead'
  | 'cancelled';

export interface QueueEvent {
  type: QueueEventType;
  requestId: string;
  timestamp: Date;
  data?: QueueResponse | Error | { attempt: number; nextRetryAt: Date };
}

export type QueueEventHandler<T extends QueueEventType = QueueEventType> = (
  event: Extract<QueueEvent, { type: T }>
) => void | Promise<void>;

// ============================================================================
// Storage Types
// ============================================================================

export interface StoredRequest {
  id: string;
  url: string;
  method: HttpMethod;
  headers: Record<string, string> | null;
  body: unknown | null;
  priority: number;
  max_retries: number;
  timeout: number | null;
  status: RequestStatus;
  attempts: number;
  scheduled_for: Date | null;
  last_attempt_at: Date | null;
  next_retry_at: Date | null;
  error: string | null;
  response: QueueResponse | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

export interface RequestAttempt {
  id: string;
  request_id: string;
  attempt_number: number;
  status_code: number | null;
  duration_ms: number | null;
  error: string | null;
  created_at: Date;
}
