import { Pool, type PoolClient } from 'pg';
import type {
  QueueManagerConfig,
  StoredRequest,
  RequestAttempt,
  RequestStatus,
  QueueRequest,
  QueueResponse,
} from '../types';

// ============================================================================
// PostgreSQL Store Class
// ============================================================================

export class PostgresStore {
  private pool: Pool;

  constructor(config: QueueManagerConfig['postgres']) {
    this.pool = new Pool({
      connectionString: config.connectionString,
      host: config.host,
      port: config.port ?? 5432,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      max: config.poolSize ?? 10,
    });
  }

  // ============================================================================
  // Connection Management
  // ============================================================================

  async connect(): Promise<void> {
    // Test connection
    const client = await this.pool.connect();
    client.release();
  }

  async disconnect(): Promise<void> {
    await this.pool.end();
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.pool.query('SELECT 1');
      return result.rowCount === 1;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // Schema Initialization
  // ============================================================================

  async initializeSchema(): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Create requests table
      await client.query(`
        CREATE TABLE IF NOT EXISTS requests (
          id UUID PRIMARY KEY,
          url TEXT NOT NULL,
          method VARCHAR(10) NOT NULL,
          headers JSONB,
          body JSONB,
          priority INT DEFAULT 50,
          max_retries INT DEFAULT 3,
          timeout INT,
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          attempts INT DEFAULT 0,
          scheduled_for TIMESTAMPTZ,
          last_attempt_at TIMESTAMPTZ,
          next_retry_at TIMESTAMPTZ,
          error TEXT,
          response JSONB,
          metadata JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          completed_at TIMESTAMPTZ
        );
      `);

      // Create request_attempts table
      await client.query(`
        CREATE TABLE IF NOT EXISTS request_attempts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          request_id UUID REFERENCES requests(id) ON DELETE CASCADE,
          attempt_number INT NOT NULL,
          status_code INT,
          duration_ms INT,
          error TEXT,
          response_headers JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // Create indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
        CREATE INDEX IF NOT EXISTS idx_requests_scheduled ON requests(scheduled_for) 
          WHERE status = 'pending' OR status = 'scheduled';
        CREATE INDEX IF NOT EXISTS idx_requests_created ON requests(created_at);
        CREATE INDEX IF NOT EXISTS idx_attempts_request ON request_attempts(request_id);
      `);

      // Create updated_at trigger function
      await client.query(`
        CREATE OR REPLACE FUNCTION update_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);

      // Create trigger
      await client.query(`
        DROP TRIGGER IF EXISTS trigger_requests_updated_at ON requests;
        CREATE TRIGGER trigger_requests_updated_at
          BEFORE UPDATE ON requests
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at();
      `);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // Request Operations
  // ============================================================================

  async saveRequest(request: QueueRequest): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO requests (
        id, url, method, headers, body, priority, max_retries, timeout,
        status, scheduled_for, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `,
      [
        request.id,
        request.url,
        request.method,
        request.headers ? JSON.stringify(request.headers) : null,
        request.body !== undefined ? JSON.stringify(request.body) : null,
        request.priority,
        request.maxRetries ?? 3,
        request.timeout ?? null,
        request.scheduledFor ? 'scheduled' : 'pending',
        request.scheduledFor ?? null,
        request.metadata ? JSON.stringify(request.metadata) : null,
        request.createdAt,
      ]
    );
  }

  async saveRequestBatch(requests: QueueRequest[]): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      for (const request of requests) {
        await client.query(
          `
          INSERT INTO requests (
            id, url, method, headers, body, priority, max_retries, timeout,
            status, scheduled_for, metadata, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `,
          [
            request.id,
            request.url,
            request.method,
            request.headers ? JSON.stringify(request.headers) : null,
            request.body !== undefined ? JSON.stringify(request.body) : null,
            request.priority,
            request.maxRetries ?? 3,
            request.timeout ?? null,
            request.scheduledFor ? 'scheduled' : 'pending',
            request.scheduledFor ?? null,
            request.metadata ? JSON.stringify(request.metadata) : null,
            request.createdAt,
          ]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getRequest(requestId: string): Promise<StoredRequest | null> {
    const result = await this.pool.query<StoredRequest>(
      'SELECT * FROM requests WHERE id = $1',
      [requestId]
    );

    return result.rows[0] ?? null;
  }

  async updateRequestStatus(
    requestId: string,
    status: RequestStatus,
    additionalData?: {
      attempts?: number;
      lastAttemptAt?: Date;
      nextRetryAt?: Date;
      error?: string;
      response?: QueueResponse;
      completedAt?: Date;
    }
  ): Promise<void> {
    const updates: string[] = ['status = $2'];
    const values: unknown[] = [requestId, status];
    let paramIndex = 3;

    if (additionalData?.attempts !== undefined) {
      updates.push(`attempts = $${paramIndex}`);
      values.push(additionalData.attempts);
      paramIndex++;
    }

    if (additionalData?.lastAttemptAt) {
      updates.push(`last_attempt_at = $${paramIndex}`);
      values.push(additionalData.lastAttemptAt);
      paramIndex++;
    }

    if (additionalData?.nextRetryAt) {
      updates.push(`next_retry_at = $${paramIndex}`);
      values.push(additionalData.nextRetryAt);
      paramIndex++;
    }

    if (additionalData?.error !== undefined) {
      updates.push(`error = $${paramIndex}`);
      values.push(additionalData.error);
      paramIndex++;
    }

    if (additionalData?.response) {
      updates.push(`response = $${paramIndex}`);
      values.push(JSON.stringify(additionalData.response));
      paramIndex++;
    }

    if (additionalData?.completedAt) {
      updates.push(`completed_at = $${paramIndex}`);
      values.push(additionalData.completedAt);
      paramIndex++;
    }

    await this.pool.query(
      `UPDATE requests SET ${updates.join(', ')} WHERE id = $1`,
      values
    );
  }

  async deleteRequest(requestId: string): Promise<void> {
    await this.pool.query('DELETE FROM requests WHERE id = $1', [requestId]);
  }

  // ============================================================================
  // Attempt Logging
  // ============================================================================

  async logAttempt(
    requestId: string,
    attemptNumber: number,
    result: {
      statusCode?: number;
      durationMs?: number;
      error?: string;
      responseHeaders?: Record<string, string>;
    }
  ): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO request_attempts (
        request_id, attempt_number, status_code, duration_ms, error, response_headers
      ) VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        requestId,
        attemptNumber,
        result.statusCode ?? null,
        result.durationMs ?? null,
        result.error ?? null,
        result.responseHeaders ? JSON.stringify(result.responseHeaders) : null,
      ]
    );
  }

  async getAttempts(requestId: string): Promise<RequestAttempt[]> {
    const result = await this.pool.query<RequestAttempt>(
      'SELECT * FROM request_attempts WHERE request_id = $1 ORDER BY attempt_number',
      [requestId]
    );

    return result.rows;
  }

  // ============================================================================
  // Query Operations
  // ============================================================================

  async getRequestsByStatus(
    status?: RequestStatus,
    limit = 100,
    offset = 0,
    host?: string
  ): Promise<StoredRequest[]> {
    const result = await this.pool.query<StoredRequest>(
      `
      SELECT * FROM requests 
      WHERE ($1::text IS NULL OR status = $1)
        AND ($4::text IS NULL OR url LIKE '%' || $4 || '%')
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
      `,
      [status ?? null, limit, offset, host ?? null]
    );

    return result.rows;
  }

  async getDeadLetterRequests(limit = 100): Promise<StoredRequest[]> {
    return this.getRequestsByStatus('dead', limit);
  }

  async retryDeadRequest(requestId: string): Promise<void> {
    await this.pool.query(
      `
      UPDATE requests 
      SET status = 'pending', 
          attempts = 0, 
          error = NULL, 
          next_retry_at = NULL
      WHERE id = $1 AND status = 'dead'
      `,
      [requestId]
    );
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  async getStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    dead: number;
    avgProcessingTime: number;
    successRate: number;
  }> {
    const countResult = await this.pool.query<{ status: RequestStatus; count: string }>(`
      SELECT status, COUNT(*) as count 
      FROM requests 
      GROUP BY status
    `);

    const counts: Record<RequestStatus, number> = {
      pending: 0,
      scheduled: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      dead: 0,
      cancelled: 0,
    };

    for (const row of countResult.rows) {
      counts[row.status] = parseInt(row.count, 10);
    }

    const avgTimeResult = await this.pool.query<{ avg: string | null }>(`
      SELECT AVG(duration_ms) as avg 
      FROM request_attempts 
      WHERE status_code IS NOT NULL
    `);

    const total = counts.completed + counts.failed + counts.dead;
    const successRate = total > 0 ? counts.completed / total : 0;

    return {
      pending: counts.pending + counts.scheduled,
      processing: counts.processing,
      completed: counts.completed,
      failed: counts.failed,
      dead: counts.dead,
      avgProcessingTime: parseFloat(avgTimeResult.rows[0]?.avg ?? '0'),
      successRate,
    };
  }

  // ============================================================================
  // Cleanup Operations
  // ============================================================================

  async cleanupCompleted(olderThanDays: number): Promise<number> {
    const result = await this.pool.query(
      `
      DELETE FROM requests 
      WHERE status = 'completed' 
        AND completed_at < NOW() - INTERVAL '1 day' * $1
      `,
      [olderThanDays]
    );

    return result.rowCount ?? 0;
  }

  async cleanupDead(olderThanDays: number): Promise<number> {
    const result = await this.pool.query(
      `
      DELETE FROM requests 
      WHERE status = 'dead' 
        AND updated_at < NOW() - INTERVAL '1 day' * $1
      `,
      [olderThanDays]
    );

    return result.rowCount ?? 0;
  }

  // ============================================================================
  // Transaction Support
  // ============================================================================

  async withTransaction<T>(
    fn: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
