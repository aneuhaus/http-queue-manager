import { useState, useRef } from "react";
import { useQuery, gql } from "@apollo/client";
import { RefreshCw, X, Clock, AlertCircle, Globe, Hash } from "lucide-react";

interface QueueRequest {
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
    const dialogRef = useRef<HTMLDialogElement>(null);

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
        dialogRef.current?.showModal();
    };

    const closeModal = () => {
        dialogRef.current?.close();
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

            <dialog
                ref={dialogRef}
                className="glass-panel modal-dialog"
                onClose={closeModal}
                onClick={(e) => {
                    if (e.target === dialogRef.current) closeModal();
                }}
            >
                {selectedRequest && (
                    <div className="modal-content p-6 flex-col gap-4">
                        <div className="flex-row justify-between items-center border-b pb-4">
                            <div className="flex-row gap-3 items-center">
                                <span
                                    className={`badge ${selectedRequest.status} text-lg px-3 py-1`}
                                >
                                    {selectedRequest.status.toUpperCase()}
                                </span>
                                <h2 className="text-xl font-bold">
                                    Request Details
                                </h2>
                            </div>
                            <button
                                onClick={closeModal}
                                className="btn-icon"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="glass-panel p-3">
                                <div className="text-sm text-secondary flex-row gap-1 items-center mb-1">
                                    <Globe size={14} /> URL
                                </div>
                                <div className="text-wrap break-all">
                                    {selectedRequest.url}
                                </div>
                            </div>
                            <div className="glass-panel p-3">
                                <div className="text-sm text-secondary flex-row gap-1 items-center mb-1">
                                    <Hash size={14} /> ID
                                </div>
                                <div>{selectedRequest.id}</div>
                            </div>
                            <div className="glass-panel p-3">
                                <div className="text-sm text-secondary flex-row gap-1 items-center mb-1">
                                    <Clock size={14} /> Timing
                                </div>
                                <div className="text-sm">
                                    Created:{" "}
                                    {new Date(
                                        selectedRequest.createdAt,
                                    ).toLocaleString()}
                                    <br />
                                    Updated:{" "}
                                    {new Date(
                                        selectedRequest.updatedAt,
                                    ).toLocaleString()}
                                    {selectedRequest.completedAt && (
                                        <>
                                            <br />
                                            Completed:{" "}
                                            {new Date(
                                                selectedRequest.completedAt,
                                            ).toLocaleString()}
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="glass-panel p-3">
                                <div className="text-sm text-secondary flex-row gap-1 items-center mb-1">
                                    <AlertCircle size={14} /> Configuration
                                </div>
                                <div>
                                    Priority: {selectedRequest.priority}
                                    <br />
                                    Attempts: {selectedRequest.attempts} /{" "}
                                    {selectedRequest.maxRetries}
                                </div>
                            </div>
                        </div>

                        {selectedRequest.error && (
                            <div className="glass-panel p-4 border-l-4 border-red-500 bg-red-500/10">
                                <div className="text-sm text-red-400 font-bold mb-1">
                                    Error
                                </div>
                                <div className="font-mono text-sm whitespace-pre-wrap">
                                    {selectedRequest.error}
                                </div>
                            </div>
                        )}

                        <div className="flex-col gap-2">
                            <div className="text-sm font-bold">Headers</div>
                            <pre className="glass-panel p-3 text-xs overflow-auto max-h-40">
                                {JSON.stringify(
                                    selectedRequest.headers,
                                    null,
                                    2,
                                )}
                            </pre>
                        </div>

                        {!!selectedRequest.body && (
                            <div className="flex-col gap-2">
                                <div className="text-sm font-bold">Body</div>
                                <pre className="glass-panel p-3 text-xs overflow-auto max-h-40">
                                    {JSON.stringify(
                                        selectedRequest.body,
                                        null,
                                        2,
                                    )}
                                </pre>
                            </div>
                        )}

                        {selectedRequest.response && (
                            <div className="flex-col gap-2">
                                <div className="text-sm font-bold">
                                    Last Response
                                </div>
                                <pre className="glass-panel p-3 text-xs overflow-auto max-h-40">
                                    {JSON.stringify(
                                        selectedRequest.response,
                                        null,
                                        2,
                                    )}
                                </pre>
                            </div>
                        )}
                    </div>
                )}
            </dialog>
        </div>
    );
}
