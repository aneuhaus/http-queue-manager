import type { QueueRequest } from "../types";
import { X, Clock, AlertCircle, Globe, Hash } from "lucide-react";
import { useRef, useEffect } from "react";
import { code } from "../utils/http-status";

interface RequestDetailsDialogProps {
    request: QueueRequest | null;
    onClose: () => void;
}

export function RequestDetailsDialog({
    request,
    onClose,
}: RequestDetailsDialogProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        if (request) {
            dialogRef.current?.showModal();
        } else {
            dialogRef.current?.close();
        }
    }, [request]);

    if (!request) return null;

    const getStatusText = (status: number) => {
        return code[status] || `Status ${status}`;
    };

    const getStatusCodeNumber = (error: string) => {
        return Number(error.replace(/[^0-9]/g, '').trim());
    };

    const capitalizePhrase = (phrase: string) => {
        return phrase.toLocaleLowerCase().replace(/\b\w/g, (char) => char.toLocaleUpperCase());
    };

    let httpStatusPhrase = "";
    if (request.error) {
      httpStatusPhrase = capitalizePhrase(code[getStatusCodeNumber(request.error)] || `Status ${request.status}`);
    }

    return (
        <dialog
            ref={dialogRef}
            className="glass-panel modal-dialog"
            onClose={onClose}
            onClick={(e) => {
                if (e.target === dialogRef.current) onClose();
            }}
        >
            <div className="modal-content p-6 flex-col gap-4">
                <div className="flex-row justify-between items-center border-b pb-4">
                    <div className="flex-row gap-3 items-center">
                        <span
                            className={`badge ${request.status} text-lg px-3 py-1`}
                        >
                            {request.status.toUpperCase()}
                        </span>
                        <h2 className="text-xl font-bold">Request Details</h2>
                    </div>
                    <button onClick={onClose} className="btn-icon">
                        <X size={24} />
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="glass-panel p-3">
                        <div className="text-sm text-secondary flex-row gap-1 items-center mb-1">
                            <Globe size={14} /> URL
                        </div>
                        <div className="text-wrap break-all">{request.url}</div>
                    </div>
                    <div className="glass-panel p-3">
                        <div className="text-sm text-secondary flex-row gap-1 items-center mb-1">
                            <Hash size={14} /> ID
                        </div>
                        <div>{request.id}</div>
                    </div>
                    <div className="glass-panel p-3">
                        <div className="text-sm text-secondary flex-row gap-1 items-center mb-1">
                            <Clock size={14} /> Timing
                        </div>
                        <div className="text-sm">
                            Created:{" "}
                            {new Date(request.createdAt).toLocaleString()}
                            <br />
                            Updated:{" "}
                            {new Date(request.updatedAt).toLocaleString()}
                            {request.completedAt && (
                                <>
                                    <br />
                                    Completed:{" "}
                                    {new Date(
                                        request.completedAt,
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
                            Priority: {request.priority}
                            <br />
                            Attempts: {request.attempts} / {request.maxRetries}
                        </div>
                    </div>
                </div>

                {request.error && (
                    <div className="glass-panel p-4 border-l-4 border-red-500 bg-red-500/10">
                        <div className="text-sm text-red-400 font-bold mb-1">
                            Error
                        </div>
                        <div className="font-mono text-sm whitespace-pre-wrap">
                            {httpStatusPhrase} ({request.error})
                        </div>
                    </div>
                )}

                <div className="flex-col gap-2">
                    <div className="text-sm font-bold">Headers</div>
                    <pre className="glass-panel p-3 text-xs overflow-auto max-h-40">
                        {JSON.stringify(request.headers, null, 2)}
                    </pre>
                </div>

                {!!request.body && (
                    <div className="flex-col gap-2">
                        <div className="text-sm font-bold">Body</div>
                        <pre className="glass-panel p-3 text-xs overflow-auto max-h-40">
                            {JSON.stringify(request.body, null, 2)}
                        </pre>
                    </div>
                )}

                {request.response && (
                    <div className="flex-col gap-2">
                        <div className="text-sm font-bold flex-row justify-between">
                            <span>Last Response</span>
                            <span className="text-xs text-secondary">
                                {getStatusText(request.response.status)}
                            </span>
                        </div>
                        <pre className="glass-panel p-3 text-xs overflow-auto max-h-40">
                            {JSON.stringify(request.response, null, 2)}
                        </pre>
                    </div>
                )}
            </div>
        </dialog>
    );
}
