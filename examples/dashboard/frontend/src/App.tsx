import { useState } from "react";
import { ApolloProvider } from "@apollo/client";
import { client } from "./client";
import { StatsOverview } from "./components/StatsOverview";
import { QueueMonitor } from "./components/QueueMonitor";
import { EnqueueForm } from "./components/EnqueueForm";
import { LayoutDashboard } from "lucide-react";

function App() {
    const [statusFilter, setStatusFilter] = useState<string>("");
    const [hostFilter, setHostFilter] = useState<string>("");

    return (
        <ApolloProvider client={client}>
            <div className="dashboard-grid">
                <header className="header">
                    <div className="flex-row">
                        <div
                            className="stat-icon"
                            style={{
                                background:
                                    "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
                            }}
                        >
                            <LayoutDashboard
                                size={24}
                                color="white"
                            />
                        </div>
                        <div>
                            <div className="text-lg">Queue Manager</div>
                            <div className="text-sm text-secondary">
                                Dashboard
                            </div>
                        </div>
                    </div>
                    <div className="flex-row">
                        <div className="badge processing">v1.0.0</div>
                    </div>
                </header>

                <aside className="stats-sidebar flex-col gap-4">
                    <StatsOverview
                        onFilterChange={setStatusFilter}
                        activeFilter={statusFilter}
                    />
                    <EnqueueForm />
                </aside>

                <main className="main-content glass-panel p-4">
                    <QueueMonitor
                        statusFilter={statusFilter}
                        setStatusFilter={setStatusFilter}
                        hostFilter={hostFilter}
                        setHostFilter={setHostFilter}
                    />
                </main>
            </div>
        </ApolloProvider>
    );
}

export default App;
