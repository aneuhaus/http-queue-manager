import Redis from 'ioredis';
import { REDIS_KEYS } from '../config';
import type { QueueRequest, QueueManagerConfig, CircuitBreakerState } from '../types';

// ============================================================================
// Redis Store Class
// ============================================================================

export class RedisStore {
  private client: Redis;
  private subscriber: Redis;
  private publisher: Redis;
  private keyPrefix: string;

  constructor(config: QueueManagerConfig['redis']) {
    const options = config.url
      ? { lazyConnect: true }
      : {
          host: config.host ?? 'localhost',
          port: config.port ?? 6379,
          password: config.password,
          db: config.db ?? 0,
          lazyConnect: true,
        };

    this.keyPrefix = config.keyPrefix ?? 'hqm:';

    if (config.url) {
      this.client = new Redis(config.url, options);
      this.subscriber = new Redis(config.url, options);
      this.publisher = new Redis(config.url, options);
    } else {
      this.client = new Redis(options);
      this.subscriber = new Redis(options);
      this.publisher = new Redis(options);
    }
  }

  private key(name: string): string {
    return `${this.keyPrefix}${name}`;
  }

  // ============================================================================
  // Connection Management
  // ============================================================================

  async connect(): Promise<void> {
    await Promise.all([
      this.client.connect(),
      this.subscriber.connect(),
      this.publisher.connect(),
    ]);
  }

  async disconnect(): Promise<void> {
    await Promise.all([
      this.client.quit(),
      this.subscriber.quit(),
      this.publisher.quit(),
    ]);
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  // ============================================================================
  // Queue Operations
  // ============================================================================

  async enqueue(request: QueueRequest): Promise<number> {
    const serialized = JSON.stringify(request);
    
    // Store request data
    await this.client.set(
      this.key(`${REDIS_KEYS.REQUEST_PREFIX}${request.id}`),
      serialized
    );

    // Add to priority queue (sorted set with priority as score)
    const position = await this.client.zadd(
      this.key(REDIS_KEYS.QUEUE),
      100 - request.priority, // Lower score = higher priority
      request.id
    );

    // Publish new request event for push-based workers
    await this.publisher.publish(
      this.key(REDIS_KEYS.CHANNEL_NEW_REQUEST),
      request.id
    );

    return position;
  }

  async enqueueMany(requests: QueueRequest[]): Promise<void> {
    const pipeline = this.client.pipeline();

    for (const request of requests) {
      const serialized = JSON.stringify(request);
      pipeline.set(
        this.key(`${REDIS_KEYS.REQUEST_PREFIX}${request.id}`),
        serialized
      );
      pipeline.zadd(
        this.key(REDIS_KEYS.QUEUE),
        100 - request.priority,
        request.id
      );
    }

    await pipeline.exec();

    // Publish batch notification
    await this.publisher.publish(
      this.key(REDIS_KEYS.CHANNEL_NEW_REQUEST),
      `batch:${requests.length}`
    );
  }

  async dequeue(): Promise<QueueRequest | null> {
    // Atomically pop from queue and add to processing set
    const result = await this.client.zpopmin(this.key(REDIS_KEYS.QUEUE));
    
    if (!result || result.length === 0) {
      return null;
    }

    const requestId = result[0];
    if (!requestId) return null;

    // Add to processing set with timestamp
    await this.client.zadd(
      this.key(REDIS_KEYS.PROCESSING),
      Date.now(),
      requestId
    );

    return this.getRequest(requestId);
  }

  async scheduleRetry(requestId: string, retryAt: Date): Promise<void> {
    // Remove from processing
    await this.client.zrem(this.key(REDIS_KEYS.PROCESSING), requestId);

    // Add to scheduled set
    await this.client.zadd(
      this.key(REDIS_KEYS.SCHEDULED),
      retryAt.getTime(),
      requestId
    );

    // Publish retry event
    await this.publisher.publish(
      this.key(REDIS_KEYS.CHANNEL_RETRY),
      JSON.stringify({ requestId, retryAt: retryAt.toISOString() })
    );
  }

  async promoteScheduledRequests(): Promise<string[]> {
    const now = Date.now();
    
    // Get all requests that are due
    const dueRequests = await this.client.zrangebyscore(
      this.key(REDIS_KEYS.SCHEDULED),
      '-inf',
      now
    );

    if (dueRequests.length === 0) {
      return [];
    }

    const pipeline = this.client.pipeline();

    for (const requestId of dueRequests) {
      // Remove from scheduled
      pipeline.zrem(this.key(REDIS_KEYS.SCHEDULED), requestId);
      // Add back to queue with high priority (50)
      pipeline.zadd(this.key(REDIS_KEYS.QUEUE), 50, requestId);
    }

    await pipeline.exec();

    // Publish events for promoted requests
    if (dueRequests.length > 0) {
      await this.publisher.publish(
        this.key(REDIS_KEYS.CHANNEL_NEW_REQUEST),
        `promoted:${dueRequests.length}`
      );
    }

    return dueRequests;
  }

  async markComplete(requestId: string): Promise<void> {
    await this.client.zrem(this.key(REDIS_KEYS.PROCESSING), requestId);
  }

  async moveToDead(requestId: string): Promise<void> {
    await this.client.zrem(this.key(REDIS_KEYS.PROCESSING), requestId);
    await this.client.zadd(
      this.key(REDIS_KEYS.DEAD_LETTER),
      Date.now(),
      requestId
    );
  }

  async cancel(requestId: string): Promise<boolean> {
    const pipeline = this.client.pipeline();
    pipeline.zrem(this.key(REDIS_KEYS.QUEUE), requestId);
    pipeline.zrem(this.key(REDIS_KEYS.SCHEDULED), requestId);
    
    const results = await pipeline.exec();
    
    // Return true if removed from either queue
    return results?.some(([, count]) => (count as number) > 0) ?? false;
  }

  // ============================================================================
  // Request Data Operations
  // ============================================================================

  async getRequest(requestId: string): Promise<QueueRequest | null> {
    const data = await this.client.get(
      this.key(`${REDIS_KEYS.REQUEST_PREFIX}${requestId}`)
    );
    
    if (!data) return null;
    
    return JSON.parse(data) as QueueRequest;
  }

  async updateRequest(request: QueueRequest): Promise<void> {
    await this.client.set(
      this.key(`${REDIS_KEYS.REQUEST_PREFIX}${request.id}`),
      JSON.stringify(request)
    );
  }

  async deleteRequest(requestId: string): Promise<void> {
    await this.client.del(this.key(`${REDIS_KEYS.REQUEST_PREFIX}${requestId}`));
  }

  // ============================================================================
  // Queue Stats
  // ============================================================================

  async getQueueSize(): Promise<number> {
    return this.client.zcard(this.key(REDIS_KEYS.QUEUE));
  }

  async getProcessingCount(): Promise<number> {
    return this.client.zcard(this.key(REDIS_KEYS.PROCESSING));
  }

  async getScheduledCount(): Promise<number> {
    return this.client.zcard(this.key(REDIS_KEYS.SCHEDULED));
  }

  async getDeadCount(): Promise<number> {
    return this.client.zcard(this.key(REDIS_KEYS.DEAD_LETTER));
  }

  // ============================================================================
  // Rate Limiting (Token Bucket)
  // ============================================================================

  async checkRateLimit(
    key: string,
    tokensPerSecond: number,
    burstSize: number
  ): Promise<{ allowed: boolean; retryAfter?: number }> {
    const now = Date.now();
    const rateLimitKey = this.key(`${REDIS_KEYS.RATE_LIMIT_PREFIX}${key}`);

    // Lua script for atomic token bucket implementation
    const script = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local rate = tonumber(ARGV[2])
      local burst = tonumber(ARGV[3])
      
      local bucket = redis.call('HMGET', key, 'tokens', 'last_update')
      local tokens = tonumber(bucket[1]) or burst
      local last_update = tonumber(bucket[2]) or now
      
      -- Refill tokens based on time elapsed
      local elapsed = (now - last_update) / 1000
      tokens = math.min(burst, tokens + (elapsed * rate))
      
      if tokens >= 1 then
        tokens = tokens - 1
        redis.call('HMSET', key, 'tokens', tokens, 'last_update', now)
        redis.call('EXPIRE', key, 60)
        return {1, 0}
      else
        local wait_time = (1 - tokens) / rate * 1000
        return {0, wait_time}
      end
    `;

    const result = await this.client.eval(
      script,
      1,
      rateLimitKey,
      now,
      tokensPerSecond,
      burstSize
    ) as [number, number];

    return {
      allowed: result[0] === 1,
      retryAfter: result[1] > 0 ? Math.ceil(result[1]) : undefined,
    };
  }

  // ============================================================================
  // Circuit Breaker
  // ============================================================================

  async getCircuitBreakerState(host: string): Promise<{
    state: CircuitBreakerState;
    failures: number;
    successes: number;
    lastFailure?: Date;
    stateChangedAt?: Date;
  }> {
    const key = this.key(`${REDIS_KEYS.CIRCUIT_BREAKER_PREFIX}${host}`);
    const data = await this.client.hgetall(key);

    if (!data || Object.keys(data).length === 0) {
      return { state: 'closed', failures: 0, successes: 0 };
    }

    return {
      state: (data.state as CircuitBreakerState) || 'closed',
      failures: parseInt(data.failures || '0', 10),
      successes: parseInt(data.successes || '0', 10),
      lastFailure: data.last_failure ? new Date(parseInt(data.last_failure, 10)) : undefined,
      stateChangedAt: data.state_changed_at
        ? new Date(parseInt(data.state_changed_at, 10))
        : undefined,
    };
  }

  async updateCircuitBreaker(
    host: string,
    update: {
      state?: CircuitBreakerState;
      incrementFailures?: boolean;
      incrementSuccesses?: boolean;
      resetCounters?: boolean;
    }
  ): Promise<void> {
    const key = this.key(`${REDIS_KEYS.CIRCUIT_BREAKER_PREFIX}${host}`);
    const now = Date.now();

    const pipeline = this.client.pipeline();

    if (update.resetCounters) {
      pipeline.hset(key, 'failures', '0', 'successes', '0');
    }

    if (update.incrementFailures) {
      pipeline.hincrby(key, 'failures', 1);
      pipeline.hset(key, 'last_failure', now.toString());
    }

    if (update.incrementSuccesses) {
      pipeline.hincrby(key, 'successes', 1);
    }

    if (update.state) {
      pipeline.hset(key, 'state', update.state, 'state_changed_at', now.toString());
    }

    pipeline.expire(key, 300); // 5 min TTL

    await pipeline.exec();
  }

  // ============================================================================
  // Pub/Sub for Push-based Workers
  // ============================================================================

  async subscribe(
    channel: 'new-request' | 'retry',
    handler: (message: string) => void | Promise<void>
  ): Promise<void> {
    const channelKey = channel === 'new-request'
      ? this.key(REDIS_KEYS.CHANNEL_NEW_REQUEST)
      : this.key(REDIS_KEYS.CHANNEL_RETRY);

    await this.subscriber.subscribe(channelKey);
    
    this.subscriber.on('message', async (ch, message) => {
      if (ch === channelKey) {
        await handler(message);
      }
    });
  }

  async unsubscribe(): Promise<void> {
    await this.subscriber.unsubscribe();
  }

  // ============================================================================
  // Distributed Locking
  // ============================================================================

  async acquireLock(
    resource: string,
    ttlMs: number
  ): Promise<{ acquired: boolean; lockId?: string }> {
    const lockId = crypto.randomUUID();
    const key = this.key(`${REDIS_KEYS.LOCK_PREFIX}${resource}`);

    const result = await this.client.set(key, lockId, 'PX', ttlMs, 'NX');

    return {
      acquired: result === 'OK',
      lockId: result === 'OK' ? lockId : undefined,
    };
  }

  async releaseLock(resource: string, lockId: string): Promise<boolean> {
    const key = this.key(`${REDIS_KEYS.LOCK_PREFIX}${resource}`);

    // Only release if we own the lock
    const script = `
      if redis.call('GET', KEYS[1]) == ARGV[1] then
        return redis.call('DEL', KEYS[1])
      else
        return 0
      end
    `;

    const result = await this.client.eval(script, 1, key, lockId) as number;
    return result === 1;
  }
}
