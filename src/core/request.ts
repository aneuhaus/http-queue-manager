import { QueueRequestSchema, type QueueRequest, type QueueRequestInput } from '../types';

/**
 * Creates a normalized QueueRequest from user input.
 */
export function createRequest(input: QueueRequestInput): QueueRequest {
  const validated = QueueRequestSchema.parse(input);

  return {
    ...validated,
    id: validated.id ?? crypto.randomUUID(),
    priority: validated.priority ?? 50,
    createdAt: new Date(),
  };
}

/**
 * Extracts the host from a URL for per-host operations.
 */
export function getHostFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host;
  } catch {
    return 'unknown';
  }
}

/**
 * Serializes a request for storage.
 */
export function serializeRequest(request: QueueRequest): string {
  return JSON.stringify({
    ...request,
    createdAt: request.createdAt.toISOString(),
    scheduledFor: request.scheduledFor?.toISOString(),
  });
}

/**
 * Deserializes a request from storage.
 */
export function deserializeRequest(data: string): QueueRequest {
  const parsed = JSON.parse(data);
  return {
    ...parsed,
    createdAt: new Date(parsed.createdAt),
    scheduledFor: parsed.scheduledFor ? new Date(parsed.scheduledFor) : undefined,
  };
}
