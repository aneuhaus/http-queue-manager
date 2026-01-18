export interface QueueRequest {
    id: string;
    url: string;
    method: string;
    status: string;
    attempts: number;
    maxRetries: number;
    priority: number;
    createdAt: string;
    updatedAt: string;
    completedAt?: string | null;
    error?: string | null;
    headers?: Record<string, unknown> | null;
    body?: unknown;
    response?: {
        status: number;
        duration: number;
        attempt: number;
        completedAt: string;
    } | null;
}
