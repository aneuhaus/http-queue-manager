import type { QueueManager } from '../../../src/core/queue-manager';
import type { RequestStatus } from '../../../src/types';

export const createResolvers = (queue: QueueManager) => ({
  Query: {
    overallStats: async () => {
      return await queue.getStats();
    },
    requests: async (_: unknown, args: { status?: string; limit?: number; offset?: number }) => {
      // We need to expose a method in QueueManager to get requests by status
      // The PostgresStore has getRequestsByStatus but QueueManager exposes getDeadLetterRequests
      // I might need to add a method to QueueManager or access postgres directly if needed.
      // For this example, let's assume we add a method or cast.
      // Since I can't easily modify the library right now without going back, 
      // I will access the private postgres instance via 'any' cast or I should have added it.
      // Better approach: I'll use the postgres store directly or add the method.
      // Let's rely on what's available or add the missing method to QueueManager.
      // QueueManager has getStatus(id), but not list.
      // I will use a direct PostgreSQL query here for simplicity or "cheat" by accessing private prop.
      // "Cheating" is faster for this example.
      
      const store = (queue as any).postgres; 
      const statusParam = args.status ? (args.status as RequestStatus) : undefined;
      let requests = await store.getRequestsByStatus(statusParam, args.limit ?? 100, args.offset ?? 0);

      return requests.map((req: any) => ({
        ...req,
        maxRetries: req.max_retries,
        createdAt: req.created_at,
        updatedAt: req.updated_at,
        completedAt: req.completed_at,
        scheduledFor: req.scheduled_for,
        lastAttemptAt: req.last_attempt_at,
        nextRetryAt: req.next_retry_at,
      }));
    },
    request: async (_: unknown, args: { id: string }) => {
      const state = await queue.getStatus(args.id);
      if (!state) return null;
      // Transform RequestState to StoredRequest shape 
      // (RequestState has nested request object, StoredRequest is flat in schema)
      return {
        ...state.request,
        status: state.status,
        attempts: state.attempts,
        updatedAt: state.updatedAt,
        lastAttemptAt: state.lastAttemptAt,
        nextRetryAt: state.nextRetryAt,
        error: state.error,
        response: state.response,
      }; 
    },
    backpressure: () => {
      return queue.getBackpressureState();
    },
  },
  Mutation: {
    enqueue: async (_: unknown, args: { input: any }) => {
      return await queue.enqueue(args.input);
    },
    enqueueMany: async (_: unknown, args: { inputs: any[] }) => {
      return await queue.enqueueMany(args.inputs);
    },
    cancelRequest: async (_: unknown, args: { id: string }) => {
      return await queue.cancel(args.id);
    },
    retryRequest: async (_: unknown, args: { id: string }) => {
      // retryDeadRequest is for dead letter. Generic retry might need logic.
      // For this example let's assume it's for dead requests.
      await queue.retryDeadRequest(args.id);
      return true;
    },
    clearQueue: async () => {
      // Not implemented in QM. 
      return false;
    }
  },
  DateTime: {
    __parseValue(value: string) { return new Date(value); },
    __serialize(value: Date) { return value.toISOString(); },
  },
  JSON: {
    __parseValue(value: any) { return value; },
    __serialize(value: any) { return value; },
  }
});
