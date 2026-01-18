import type { QueueRequest } from "../types";
import { useState } from "react";
import { useQuery, gql } from "@apollo/client";
import { RefreshCw } from "lucide-react";

import { RequestDetailsDialog } from "./RequestDetailsDialog";

interface GetRequestsData {
    requests: QueueRequest[];
}

interface GetRequestsVars {
    status?: string;
    host?: string;
}

const GET_REQUESTS = gql`
    query GetRequests($status: String, $host: String) {
        requests(status: $status, host: $host, limit: 50) {
            id
            url
            method
            status
            attempts
            maxRetries
            priority
            createdAt
            updatedAt
            completedAt
            error
            headers
            body
            response {
                status
                duration
                attempt
                completedAt
            }
        }
    }
`;

interface QueueMonitorProps {
    statusFilter: string;
    setStatusFilter: (status: string) => void;
    hostFilter: string;
    setHostFilter: (host: string) => void;
}

export function QueueMonitor({
    statusFilter,
    setStatusFilter,
    hostFilter,
    setHostFilter,
}: QueueMonitorProps) {
    const [selectedRequest, setSelectedRequest] = useState<QueueRequest | null>(
        null,
    );

    const { data, loading, refetch } = useQuery<
        GetRequestsData,
        GetRequestsVars
    >(GET_REQUESTS, {
        variables: {
            status: statusFilter || undefined,
            host: hostFilter || undefined,
        },
        pollInterval: 3000,
    });

    const openModal = (req: QueueRequest) => {
        setSelectedRequest(req);
    };

    const closeModal = () => {
        setSelectedRequest(null);
    };

    return (
        <div className="flex-col gap-4 h-full">
            <div className="flex-row justify-between">
                <div className="text-lg">Recent Requests</div>
                <div className="flex-row gap-2">
                    <input
                        type="text"
                        placeholder="Filter by host..."
                        className="glass-panel p-2 btn-secondary"
                        value={hostFilter}
                        onChange={(e) => setHostFilter(e.target.value)}
                        style={{ minWidth: "200px" }}
                    />
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
                        ) : !data || data.requests.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={6}
                                    className="text-center p-4"
                                >
                                    No requests found
                                </td>
                            </tr>
                        ) : (
                            data.requests.map((req) => (
                                <tr
                                    key={req.id}
                                    onClick={() => openModal(req)}
                                    style={{ cursor: "pointer" }}
                                    className="hover-row"
                                >
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
                                    <td>
                                        {req.attempts} / {req.maxRetries}
                                    </td>
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

            <RequestDetailsDialog
                request={selectedRequest}
                onClose={closeModal}
            />
        </div>
    );
}
