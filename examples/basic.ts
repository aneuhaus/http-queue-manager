/**
 * Example: Basic usage of the HTTP Queue Manager
 *
 * Before running:
 * 1. Start Redis and PostgreSQL: docker compose up -d
 * 2. Run: bun run examples/basic.ts
 */

import { createQueueManager } from '../src';

async function main() {
  console.log('🚀 Starting HTTP Queue Manager...\n');

  // Create the queue manager
  const queue = await createQueueManager({
    redis: { url: 'redis://localhost:6379' },
    postgres: {
      connectionString: 'postgresql://queue:queue_password@localhost:5432/queue',
    },
    concurrency: 5,
    retry: {
      strategy: 'exponential',
      maxRetries: 3,
      baseDelay: 1000,
    },
  });

  console.log('✅ Queue manager initialized\n');

  // Register event handlers
  queue.onComplete((response) => {
    console.log(`✅ Request ${response.requestId} completed`);
    console.log(`   Status: ${response.status}`);
    console.log(`   Duration: ${response.duration}ms`);
    console.log(`   Attempt: ${response.attempt}\n`);
  });

  queue.onError((requestId, error, willRetry) => {
    if (willRetry) {
      console.log(`⚠️  Request ${requestId} failed, will retry: ${error.message}`);
    } else {
      console.log(`❌ Request ${requestId} failed permanently: ${error.message}`);
    }
  });

  queue.onRetry((requestId, attempt, nextRetryAt) => {
    console.log(`🔄 Request ${requestId} retry #${attempt} scheduled for ${nextRetryAt.toISOString()}`);
  });

  queue.onDead((requestId, error) => {
    console.log(`💀 Request ${requestId} moved to dead letter queue: ${error.message}`);
  });

  // Enqueue some requests
  console.log('📝 Enqueueing requests...\n');

  // Example 1: Simple GET request
  const result1 = await queue.enqueue({
    url: 'https://httpbin.org/get',
    method: 'GET',
    priority: 80,
  });
  console.log(`   Enqueued GET request: ${result1.id}`);

  // Example 2: POST request with body
  const result2 = await queue.enqueue({
    url: 'https://httpbin.org/post',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { message: 'Hello from queue!' },
  });
  console.log(`   Enqueued POST request: ${result2.id}`);

  // Example 3: Request that will fail (404)
  const result3 = await queue.enqueue({
    url: 'https://httpbin.org/status/404',
    method: 'GET',
  });
  console.log(`   Enqueued 404 request: ${result3.id}`);

  // Example 4: Request that will trigger retry (503)
  const result4 = await queue.enqueue({
    url: 'https://httpbin.org/status/503',
    method: 'GET',
    maxRetries: 2,
  });
  console.log(`   Enqueued 503 request (will retry): ${result4.id}`);

  console.log('\n⏳ Processing requests (waiting 30 seconds)...\n');

  // Wait for processing
  await Bun.sleep(30000);

  // Get stats
  const stats = await queue.getStats();
  console.log('\n📊 Queue Statistics:');
  console.log(`   Pending: ${stats.pending}`);
  console.log(`   Processing: ${stats.processing}`);
  console.log(`   Completed: ${stats.completed}`);
  console.log(`   Failed: ${stats.failed}`);
  console.log(`   Dead: ${stats.dead}`);
  console.log(`   Success Rate: ${(stats.successRate * 100).toFixed(1)}%`);
  console.log(`   Avg Processing Time: ${stats.avgProcessingTime.toFixed(0)}ms`);

  // Shutdown
  console.log('\n🛑 Shutting down...');
  await queue.shutdown();
  console.log('✅ Done!');
}

main().catch(console.error);
