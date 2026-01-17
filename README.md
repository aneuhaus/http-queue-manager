# HTTP Queue Manager

A TypeScript library for managing HTTP request queues with retry and backpressure features. Built for [Bun](https://bun.sh/) runtime using Redis for fast queue operations and PostgreSQL for durable state persistence.

## Features

- 🚀 **Push-based Workers** - Real-time processing with Redis pub/sub
- 🔄 **Configurable Retry Strategies** - Exponential, linear, fixed, or custom backoff
- 🛡️ **Backpressure Control** - Rate limiting, circuit breaker, and concurrency limits
- 💾 **Dual Storage** - Redis for speed, PostgreSQL for durability
- 📊 **Full Observability** - Request tracking, attempt logging, and statistics
- 💀 **Dead Letter Queue** - Failed requests preserved for manual retry

## Installation

```bash
bun add http-queue-manager
```

## Quick Start

```typescript
import { createQueueManager } from 'http-queue-manager';

const queue = await createQueueManager({
  redis: { url: 'redis://localhost:6379' },
  postgres: { connectionString: 'postgresql://user:pass@localhost:5432/queue' },
});

// Enqueue a request
const { id } = await queue.enqueue({
  url: 'https://api.example.com/webhooks',
  method: 'POST',
  body: { event: 'user.created', data: { userId: '123' } },
});

// Handle completions
queue.onComplete((response) => {
  console.log(`Request ${response.requestId} completed with status ${response.status}`);
});

// Handle failures
queue.onDead((requestId, error) => {
  console.error(`Request ${requestId} failed permanently: ${error.message}`);
});

// Graceful shutdown
process.on('SIGTERM', () => queue.shutdown());
```

## Configuration

```typescript
import { createQueueManager } from 'http-queue-manager';

const queue = await createQueueManager({
  // Redis connection
  redis: {
    url: 'redis://localhost:6379',
    // Or individual options:
    // host: 'localhost',
    // port: 6379,
    // password: 'secret',
    // db: 0,
    keyPrefix: 'myapp:', // Optional prefix for all keys
  },

  // PostgreSQL connection
  postgres: {
    connectionString: 'postgresql://...',
    // Or individual options:
    // host: 'localhost',
    // port: 5432,
    // database: 'queue',
    // user: 'postgres',
    // password: 'secret',
    poolSize: 10,
  },

  // Processing options
  concurrency: 10, // Max concurrent requests
  workerCount: 1,  // Number of workers

  // Retry configuration
  retry: {
    strategy: 'exponential', // 'exponential' | 'linear' | 'fixed' | 'custom'
    maxRetries: 3,
    baseDelay: 1000,  // 1 second
    maxDelay: 30000,  // 30 seconds
    jitter: true,     // Add randomization
    retryOn: [408, 429, 500, 502, 503, 504], // Status codes to retry
  },

  // Backpressure configuration
  backpressure: {
    maxConcurrency: 10,
    perHostConcurrency: 5,
    rateLimit: {
      requestsPerSecond: 100,
      burstSize: 150,
    },
    circuitBreaker: {
      failureThreshold: 5,
      successThreshold: 3,
      resetTimeout: 30000,
      halfOpenMaxRequests: 3,
    },
  },
});
```

## API Reference

### Queue Operations

```typescript
// Enqueue single request
const { id, position } = await queue.enqueue({
  url: 'https://api.example.com/data',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: { key: 'value' },
  priority: 75,       // 0-100, higher = more urgent
  maxRetries: 5,      // Override default
  timeout: 10000,     // Request timeout in ms
  scheduledFor: new Date(Date.now() + 60000), // Delay execution
});

// Batch enqueue
const results = await queue.enqueueMany([
  { url: 'https://api.example.com/1', method: 'GET' },
  { url: 'https://api.example.com/2', method: 'GET' },
]);

// Get request status
const state = await queue.getStatus(id);
// { id, status, attempts, lastAttemptAt, error, response, ... }

// Cancel pending request
const cancelled = await queue.cancel(id);

// Get statistics
const stats = await queue.getStats();
// { pending, processing, completed, failed, dead, avgProcessingTime, successRate }
```

### Dead Letter Queue

```typescript
// Get failed requests
const deadRequests = await queue.getDeadLetterRequests(100);

// Retry a dead request
await queue.retryDeadRequest(requestId);
```

### Queue Control

```typescript
// Pause processing
await queue.pause();

// Resume processing
await queue.resume();

// Graceful shutdown
await queue.shutdown();
```

### Event Handlers

```typescript
queue.onComplete((response) => {
  // response: { requestId, status, headers, body, duration, attempt, completedAt }
});

queue.onError((requestId, error, willRetry) => {
  if (willRetry) {
    console.log(`Request ${requestId} failed, will retry`);
  }
});

queue.onRetry((requestId, attempt, nextRetryAt) => {
  console.log(`Retry #${attempt} scheduled for ${nextRetryAt}`);
});

queue.onDead((requestId, error) => {
  console.error(`Request ${requestId} moved to dead letter queue`);
});
```

## Development

```bash
# Install dependencies
bun install

# Run type check
bun run typecheck

# Run tests
bun test

# Build for production
bun run build
```

## License

MIT
