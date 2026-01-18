import { DateTimeResolver, JSONResolver } from 'graphql-scalars';
import type { QueueManager } from '../../../src/core/queue-manager';
import type { RequestStatus } from '../../../src/types';

export const createResolvers = (queue: QueueManager) => ({
  Query: {
    overallStats: async () => {
      return await queue.getStats();
    },
    requests: async (_: unknown, args: { status?: string; host?: string; limit?: number; offset?: number }) => {
      const store = (queue as any).postgres; 
      const statusParam = args.status ? (args.status as RequestStatus) : undefined;
      let requests = await store.getRequestsByStatus(statusParam, args.limit ?? 100, args.offset ?? 0, args.host);

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
      await queue.retryDeadRequest(args.id);
      return true;
    },
    clearQueue: async () => {
      return false;
    }
  },
  DateTime: DateTimeResolver,
  JSON: JSONResolver,
});
