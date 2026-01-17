import type {
  QueueRequest,
  QueueResponse,
  RetryConfig,
} from '../types';
import type { RedisStore } from '../storage/redis';
import type { PostgresStore } from '../storage/postgres';
import { BackpressureController } from '../backpressure/controller';
import {
  calculateRetryDelay,
  shouldRetry,
} from '../retry/strategies';
import { getHostFromUrl } from './request';

// ============================================================================
// Worker Class
// ============================================================================

export interface WorkerEvents {
  onComplete: (response: QueueResponse) => void | Promise<void>;
  onError: (requestId: string, error: Error, willRetry: boolean) => void | Promise<void>;
  onRetry: (requestId: string, attempt: number, nextRetryAt: Date) => void | Promise<void>;
  onDead: (requestId: string, error: Error) => void | Promise<void>;
}

export class Worker {
  private redis: RedisStore;
  private postgres: PostgresStore;
  private backpressure: BackpressureController;
  private retryConfig: RetryConfig;
  private events: Partial<WorkerEvents>;
  private running = false;
  private processing = new Set<string>();

  constructor(
    redis: RedisStore,
    postgres: PostgresStore,
    backpressure: BackpressureController,
    retryConfig: RetryConfig,
    events: Partial<WorkerEvents> = {}
  ) {
    this.redis = redis;
    this.postgres = postgres;
    this.backpressure = backpressure;
    this.retryConfig = retryConfig;
    this.events = events;
  }

  /**
   * Starts the worker with push-based notification.
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Subscribe to new request notifications
    await this.redis.subscribe('new-request', async (message) => {
      if (!this.running) return;

      // Handle batch notifications
      if (message.startsWith('batch:') || message.startsWith('promoted:')) {
        await this.processAvailable();
      } else {
        // Single request notification
        await this.processNext();
      }
    });

    // Subscribe to retry notifications
    await this.redis.subscribe('retry', async () => {
      if (!this.running) return;
      
      // Promote any scheduled requests that are due
      await this.redis.promoteScheduledRequests();
    });

    // Initial check for existing queue items
    await this.processAvailable();

    // Periodic check for scheduled retries
    this.scheduleRetryCheck();
  }

  /**
   * Stops the worker gracefully.
   */
  async stop(): Promise<void> {
    this.running = false;
    await this.redis.unsubscribe();

    // Wait for in-flight requests to complete (with timeout)
    const timeout = 30000;
    const startTime = Date.now();

    while (this.processing.size > 0 && Date.now() - startTime < timeout) {
      await Bun.sleep(100);
    }
  }

  /**
   * Processes all available requests in the queue.
   */
  private async processAvailable(): Promise<void> {
    while (this.running) {
      const processed = await this.processNext();
      if (!processed) break;
    }
  }

  /**
   * Processes the next request in the queue.
   */
  private async processNext(): Promise<boolean> {
    const request = await this.redis.dequeue();
    if (!request) return false;

    // Don't process if already being processed
    if (this.processing.has(request.id)) return true;

    this.processing.add(request.id);

    // Process in background
    this.processRequest(request).finally(() => {
      this.processing.delete(request.id);
    });

    return true;
  }

  /**
   * Processes a single request.
   */
  private async processRequest(request: QueueRequest): Promise<void> {
    const host = getHostFromUrl(request.url);
    const maxRetries = request.maxRetries ?? this.retryConfig.maxRetries;

    // Get current attempt count from PostgreSQL
    const storedRequest = await this.postgres.getRequest(request.id);
    const currentAttempt = (storedRequest?.attempts ?? 0) + 1;

    // Wait for backpressure slot
    const canProceed = await this.backpressure.waitForSlot(host, 30000);
    
    if (!canProceed) {
      // Reschedule if we couldn't get a slot
      await this.redis.scheduleRetry(request.id, new Date(Date.now() + 5000));
      return;
    }

    this.backpressure.acquire(host);

    try {
      // Update status to processing
      await this.postgres.updateRequestStatus(request.id, 'processing', {
        attempts: currentAttempt,
        lastAttemptAt: new Date(),
      });

      // Execute the request
      const startTime = Date.now();
      const response = await this.executeRequest(request);
      const duration = Date.now() - startTime;

      // Log attempt
      await this.postgres.logAttempt(request.id, currentAttempt, {
        statusCode: response.status,
        durationMs: duration,
        responseHeaders: response.headers,
      });

      // Check if response indicates success
      if (response.status >= 200 && response.status < 300) {
        await this.handleSuccess(request, response, currentAttempt, duration);
      } else {
        await this.handleFailure(
          request,
          response.status,
          new Error(`HTTP ${response.status}`),
          currentAttempt,
          maxRetries
        );
      }

      // Record success for circuit breaker
      await this.backpressure.recordSuccess(host);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // Log failed attempt
      await this.postgres.logAttempt(request.id, currentAttempt, {
        error: err.message,
      });

      await this.handleFailure(request, undefined, err, currentAttempt, maxRetries);

      // Record failure for circuit breaker
      await this.backpressure.recordFailure(host);
    } finally {
      this.backpressure.release(host);
    }
  }

  /**
   * Executes the HTTP request.
   */
  private async executeRequest(request: QueueRequest): Promise<{
    status: number;
    headers: Record<string, string>;
    body: unknown;
  }> {
    const controller = new AbortController();
    const timeout = request.timeout ?? 30000;

    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body ? JSON.stringify(request.body) : undefined,
        signal: controller.signal,
      });

      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      let body: unknown;
      const contentType = response.headers.get('content-type') ?? '';
      
      if (contentType.includes('application/json')) {
        body = await response.json();
      } else {
        body = await response.text();
      }

      return {
        status: response.status,
        headers,
        body,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Handles a successful request.
   */
  private async handleSuccess(
    request: QueueRequest,
    response: { status: number; headers: Record<string, string>; body: unknown },
    attempt: number,
    duration: number
  ): Promise<void> {
    const queueResponse: QueueResponse = {
      requestId: request.id,
      status: response.status,
      headers: response.headers,
      body: response.body,
      duration,
      attempt,
      completedAt: new Date(),
    };

    // Update PostgreSQL
    await this.postgres.updateRequestStatus(request.id, 'completed', {
      response: queueResponse,
      completedAt: new Date(),
    });

    // Mark complete in Redis
    await this.redis.markComplete(request.id);

    // Emit event
    await this.events.onComplete?.(queueResponse);
  }

  /**
   * Handles a failed request.
   */
  private async handleFailure(
    request: QueueRequest,
    statusCode: number | undefined,
    error: Error,
    currentAttempt: number,
    maxRetries: number
  ): Promise<void> {
    const willRetry = shouldRetry(
      statusCode,
      error,
      currentAttempt,
      { ...this.retryConfig, maxRetries }
    );

    if (willRetry) {
      // Calculate next retry time
      const delay = calculateRetryDelay(currentAttempt, this.retryConfig);
      const nextRetryAt = new Date(Date.now() + delay);

      // Update PostgreSQL
      await this.postgres.updateRequestStatus(request.id, 'pending', {
        nextRetryAt,
        error: error.message,
      });

      // Schedule retry in Redis
      await this.redis.scheduleRetry(request.id, nextRetryAt);

      // Emit event
      await this.events.onRetry?.(request.id, currentAttempt, nextRetryAt);
      await this.events.onError?.(request.id, error, true);
    } else {
      // Move to dead letter queue
      await this.postgres.updateRequestStatus(request.id, 'dead', {
        error: error.message,
      });

      await this.redis.moveToDead(request.id);

      // Emit events
      await this.events.onDead?.(request.id, error);
      await this.events.onError?.(request.id, error, false);
    }
  }

  /**
   * Periodically checks for scheduled retries.
   */
  private scheduleRetryCheck(): void {
    const check = async () => {
      if (!this.running) return;

      const promoted = await this.redis.promoteScheduledRequests();
      
      if (promoted.length > 0) {
        await this.processAvailable();
      }

      // Schedule next check
      setTimeout(check, 1000);
    };

    setTimeout(check, 1000);
  }
}
