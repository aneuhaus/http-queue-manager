import type {
  QueueManagerConfig,
  QueueRequestInput,
  QueueResponse,
  EnqueueResult,
  QueueStats,
  RequestState,
  BackpressureConfig,
  RetryConfig,
} from '../types';
import { RedisStore } from '../storage/redis';
import { PostgresStore } from '../storage/postgres';
import { BackpressureController } from '../backpressure/controller';
import { Worker, type WorkerEvents } from './worker';
import { createRequest } from './request';
import { mergeConfig } from '../config';

// ============================================================================
// Queue Manager
// ============================================================================

export class QueueManager {
  private redis: RedisStore;
  private postgres: PostgresStore;
  private backpressure: BackpressureController;
  private workers: Worker[] = [];
  private config: QueueManagerConfig & {
    retry: RetryConfig;
    backpressure: BackpressureConfig;
  };
  private eventHandlers: Partial<{
    complete: ((response: QueueResponse) => void | Promise<void>)[];
    error: ((requestId: string, error: Error, willRetry: boolean) => void)[];
    retry: ((requestId: string, attempt: number, nextRetryAt: Date) => void)[];
    dead: ((requestId: string, error: Error) => void)[];
  }> = {};
  private started = false;
  private shuttingDown = false;

  private constructor(config: QueueManagerConfig) {
    this.config = mergeConfig(config);
    this.redis = new RedisStore(config.redis);
    this.postgres = new PostgresStore(config.postgres);
    this.backpressure = new BackpressureController(
      this.redis,
      this.config.backpressure
    );
  }

  /**
   * Creates and initializes a new QueueManager.
   */
  static async create(config: QueueManagerConfig): Promise<QueueManager> {
    const manager = new QueueManager(config);
    await manager.initialize();
    return manager;
  }

  /**
   * Initializes connections and schema.
   */
  private async initialize(): Promise<void> {
    await this.redis.connect();
    await this.postgres.connect();
    await this.postgres.initializeSchema();
  }

  /**
   * Starts processing requests.
   */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    const workerCount = this.config.workerCount ?? 1;
    const workerEvents: WorkerEvents = {
      onComplete: (response) => this.emitComplete(response),
      onError: (id, err, retry) => this.emitError(id, err, retry),
      onRetry: (id, attempt, next) => this.emitRetry(id, attempt, next),
      onDead: (id, err) => this.emitDead(id, err),
    };

    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker(
        this.redis,
        this.postgres,
        this.backpressure,
        this.config.retry,
        workerEvents
      );
      this.workers.push(worker);
      await worker.start();
    }
  }

  // ============================================================================
  // Enqueue Operations
  // ============================================================================

  /**
   * Enqueues a single request.
   */
  async enqueue(input: QueueRequestInput): Promise<EnqueueResult> {
    if (this.shuttingDown) {
      throw new Error('Queue manager is shutting down');
    }

    const request = createRequest(input);

    // Persist to PostgreSQL first
    await this.postgres.saveRequest(request);

    // Add to Redis queue
    const position = await this.redis.enqueue(request);

    return { id: request.id, position };
  }

  /**
   * Enqueues multiple requests in batch.
   */
  async enqueueMany(inputs: QueueRequestInput[]): Promise<EnqueueResult[]> {
    if (this.shuttingDown) {
      throw new Error('Queue manager is shutting down');
    }

    const requests = inputs.map((input) => createRequest(input));

    // Persist to PostgreSQL
    await this.postgres.saveRequestBatch(requests);

    // Add to Redis queue
    await this.redis.enqueueMany(requests);

    return requests.map((r) => ({ id: r.id }));
  }

  // ============================================================================
  // Status Operations
  // ============================================================================

  /**
   * Gets the current state of a request.
   */
  async getStatus(requestId: string): Promise<RequestState | null> {
    const stored = await this.postgres.getRequest(requestId);
    if (!stored) return null;

    return {
      id: stored.id,
      request: {
        id: stored.id,
        url: stored.url,
        method: stored.method,
        headers: stored.headers ?? undefined,
        body: stored.body,
        priority: stored.priority,
        maxRetries: stored.max_retries,
        timeout: stored.timeout ?? undefined,
        scheduledFor: stored.scheduled_for ?? undefined,
        metadata: stored.metadata ?? undefined,
        createdAt: stored.created_at,
      },
      status: stored.status,
      attempts: stored.attempts,
      lastAttemptAt: stored.last_attempt_at ?? undefined,
      nextRetryAt: stored.next_retry_at ?? undefined,
      error: stored.error ?? undefined,
      response: stored.response ?? undefined,
      createdAt: stored.created_at,
      updatedAt: stored.updated_at,
    };
  }

  /**
   * Cancels a pending request.
   */
  async cancel(requestId: string): Promise<boolean> {
    const cancelled = await this.redis.cancel(requestId);
    
    if (cancelled) {
      await this.postgres.updateRequestStatus(requestId, 'cancelled');
    }

    return cancelled;
  }

  /**
   * Gets queue statistics.
   */
  async getStats(): Promise<QueueStats> {
    return this.postgres.getStats();
  }

  /**
   * Gets current backpressure state.
   */
  getBackpressureState() {
    return this.backpressure.getState();
  }

  // ============================================================================
  // Dead Letter Queue Operations
  // ============================================================================

  /**
   * Gets requests in the dead letter queue.
   */
  async getDeadLetterRequests(limit = 100) {
    return this.postgres.getDeadLetterRequests(limit);
  }

  /**
   * Retries a request from the dead letter queue.
   */
  async retryDeadRequest(requestId: string): Promise<void> {
    await this.postgres.retryDeadRequest(requestId);
    
    const request = await this.postgres.getRequest(requestId);
    if (request) {
      await this.redis.enqueue({
        id: request.id,
        url: request.url,
        method: request.method,
        headers: request.headers ?? undefined,
        body: request.body,
        priority: request.priority,
        maxRetries: request.max_retries,
        timeout: request.timeout ?? undefined,
        createdAt: request.created_at,
      });
    }
  }

  // ============================================================================
  // Queue Control
  // ============================================================================

  /**
   * Pauses processing (workers continue current work but don't pick up new).
   */
  async pause(): Promise<void> {
    for (const worker of this.workers) {
      await worker.stop();
    }
  }

  /**
   * Resumes processing.
   */
  async resume(): Promise<void> {
    for (const worker of this.workers) {
      await worker.start();
    }
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  /**
   * Registers a handler for successful completions.
   */
  onComplete(handler: (response: QueueResponse) => void | Promise<void>): void {
    this.eventHandlers.complete ??= [];
    this.eventHandlers.complete.push(handler);
  }

  /**
   * Registers a handler for errors.
   */
  onError(
    handler: (requestId: string, error: Error, willRetry: boolean) => void | Promise<void>
  ): void {
    this.eventHandlers.error ??= [];
    this.eventHandlers.error.push(handler);
  }

  /**
   * Registers a handler for retries.
   */
  onRetry(
    handler: (requestId: string, attempt: number, nextRetryAt: Date) => void | Promise<void>
  ): void {
    this.eventHandlers.retry ??= [];
    this.eventHandlers.retry.push(handler);
  }

  /**
   * Registers a handler for dead-lettered requests.
   */
  onDead(handler: (requestId: string, error: Error) => void | Promise<void>): void {
    this.eventHandlers.dead ??= [];
    this.eventHandlers.dead.push(handler);
  }

  private async emitComplete(response: QueueResponse): Promise<void> {
    for (const handler of this.eventHandlers.complete ?? []) {
      await handler(response);
    }
  }

  private async emitError(
    requestId: string,
    error: Error,
    willRetry: boolean
  ): Promise<void> {
    for (const handler of this.eventHandlers.error ?? []) {
      await handler(requestId, error, willRetry);
    }
  }

  private async emitRetry(
    requestId: string,
    attempt: number,
    nextRetryAt: Date
  ): Promise<void> {
    for (const handler of this.eventHandlers.retry ?? []) {
      await handler(requestId, attempt, nextRetryAt);
    }
  }

  private async emitDead(requestId: string, error: Error): Promise<void> {
    for (const handler of this.eventHandlers.dead ?? []) {
      await handler(requestId, error);
    }
  }

  // ============================================================================
  // Shutdown
  // ============================================================================

  /**
   * Gracefully shuts down the queue manager.
   */
  async shutdown(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    // Stop all workers
    await Promise.all(this.workers.map((w) => w.stop()));

    // Close connections
    await this.redis.disconnect();
    await this.postgres.disconnect();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates and initializes a QueueManager.
 */
export async function createQueueManager(
  config: QueueManagerConfig
): Promise<QueueManager> {
  const manager = await QueueManager.create(config);
  await manager.start();
  return manager;
}
