import { useState } from 'react';
import { useQuery, gql } from '@apollo/client';
import { RefreshCw } from 'lucide-react';

interface QueueRequest {
    id: string;
    url: string;
    method: string;
    status: string;
    attempts: number;
    createdAt: string;
    updatedAt: string;
    error?: string | null;
}

interface GetRequestsData {
    requests: QueueRequest[];
}

interface GetRequestsVars {
    status?: string;
}

const GET_REQUESTS = gql`
  query GetRequests($status: String) {
    requests(status: $status, limit: 50) {
      id
      url
      method
      status
      attempts
      createdAt
      updatedAt
      error
    }
  }
`;

export function QueueMonitor() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const { data, loading, refetch } = useQuery<GetRequestsData, GetRequestsVars>(
      GET_REQUESTS,
      {
          variables: { status: statusFilter || undefined },
          pollInterval: 3000,
      },
  );

  return (
      <div className="flex-col gap-4 h-full">
          <div className="flex-row justify-between">
              <div className="text-lg">Recent Requests</div>
              <div className="flex-row gap-2">
                  <select
                      className="glass-panel p-2 btn-secondary"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                  >
                      <option value="">All Statuses</option>
                      <option value="pending">Pending</option>
                      <option value="processing">Processing</option>
                      <option value="completed">Completed</option>
                      <option value="failed">Failed</option>
                      <option value="dead">Dead</option>
                  </select>
                  <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => refetch()}
                  >
                      <RefreshCw size={16} />
                  </button>
              </div>
          </div>

          <div className="glass-panel table-container flex-1">
              <table>
                  <thead>
                      <tr>
                          <th>Method</th>
                          <th>URL</th>
                          <th>Status</th>
                          <th>Attempts</th>
                          <th>Created</th>
                          <th>Error</th>
                      </tr>
                  </thead>
                  <tbody>
                      {loading && !data ? (
                          <tr>
                              <td
                                  colSpan={6}
                                  className="text-center p-4"
                              >
                                  Loading...
                              </td>
                          </tr>
                      ) : data?.requests.length === 0 ? (
                          <tr>
                              <td
                                  colSpan={6}
                                  className="text-center p-4"
                              >
                                  No requests found
                              </td>
                          </tr>
                      ) : (
                          data?.requests.map((req) => (
                              <tr key={req.id}>
                                  <td>
                                      <span className="badge">
                                          {req.method}
                                      </span>
                                  </td>
                                  <td>
                                      <div
                                          style={{
                                              maxWidth: "300px",
                                              overflow: "hidden",
                                              textOverflow: "ellipsis",
                                              whiteSpace: "nowrap",
                                          }}
                                          title={req.url}
                                      >
                                          {req.url}
                                      </div>
                                  </td>
                                  <td>
                                      <span className={`badge ${req.status}`}>
                                          {req.status}
                                      </span>
                                  </td>
                                  <td>{req.attempts}</td>
                                  <td>
                                      {new Date(
                                          req.createdAt,
                                      ).toLocaleTimeString()}
                                  </td>
                                  <td
                                      className="text-error"
                                      style={{
                                          maxWidth: "200px",
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                          whiteSpace: "nowrap",
                                      }}
                                      title={req.error || undefined}
                                  >
                                      {req.error || ""}
                                  </td>
                              </tr>
                          ))
                      )}
                  </tbody>
              </table>
          </div>
      </div>
  );
}
