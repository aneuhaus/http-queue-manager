import { useQuery, gql } from '@apollo/client';
import { Activity, CheckCircle, Clock, AlertOctagon, Skull } from 'lucide-react';

const GET_STATS = gql`
  query GetStats {
    overallStats {
      pending
      processing
      completed
      failed
      dead
      successRate
      avgProcessingTime
    }
  }
`;

interface StatsOverviewProps {
    onFilterChange: (status: string) => void;
    activeFilter: string;
}

export function StatsOverview({
    onFilterChange,
    activeFilter,
}: StatsOverviewProps) {
    const { data, loading, error } = useQuery(GET_STATS, {
        pollInterval: 2000,
    });

    if (loading) return <div>Loading stats...</div>;
    if (error) return <div>Error loading stats</div>;

    const stats = data?.overallStats || {};

    const handleStatClick = (status: string) => {
        if (activeFilter === status) {
            onFilterChange("");
        } else {
            onFilterChange(status);
        }
    };

    return (
        <div className="flex-col gap-4">
            <StatCard
                icon={<Activity className="text-yellow-400" />}
                label="Processing"
                value={stats.processing}
                color="#fbbf24"
                isActive={activeFilter === "processing"}
                onClick={() => handleStatClick("processing")}
            />
            <StatCard
                icon={<Clock className="text-blue-400" />}
                label="Pending"
                value={stats.pending}
                color="#60a5fa"
                isActive={activeFilter === "pending"}
                onClick={() => handleStatClick("pending")}
            />
            <StatCard
                icon={<CheckCircle className="text-green-400" />}
                label="Completed"
                value={stats.completed}
                color="#34d399"
                isActive={activeFilter === "completed"}
                onClick={() => handleStatClick("completed")}
            />
            <StatCard
                icon={<AlertOctagon className="text-red-400" />}
                label="Failed"
                value={stats.failed}
                color="#f87171"
                isActive={activeFilter === "failed"}
                onClick={() => handleStatClick("failed")}
            />
            <StatCard
                icon={<Skull className="text-gray-400" />}
                label="Dead Letter"
                value={stats.dead}
                color="#94a3b8"
                isActive={activeFilter === "dead"}
                onClick={() => handleStatClick("dead")}
            />

            <div className="glass-panel p-4 mt-4">
                <div className="text-sm text-secondary">Success Rate</div>
                <div className="text-lg">
                    {(stats.successRate * 100).toFixed(1)}%
                </div>
            </div>

            <div className="glass-panel p-4">
                <div className="text-sm text-secondary">Avg Time</div>
                <div className="text-lg">
                    {Math.round(stats.avgProcessingTime)} ms
                </div>
            </div>
        </div>
    );
}

interface StatCardProps {
    icon: React.ReactNode;
    label: string;
    value: number;
    color: string;
    isActive: boolean;
    onClick: () => void;
}

function StatCard({
    icon,
    label,
    value,
    color,
    isActive,
    onClick,
}: StatCardProps) {
    return (
        <div
            className={`glass-panel stat-card ${isActive ? "active" : ""}`}
            style={{
                borderLeft: `3px solid ${color}`,
                cursor: "pointer",
                background: isActive ? "rgba(255, 255, 255, 0.1)" : undefined,
                transform: isActive ? "scale(1.02)" : undefined,
                transition: "all 0.2s",
            }}
            onClick={onClick}
        >
            <div
                className="stat-icon"
                style={{ color }}
            >
                {icon}
            </div>
            <div>
                <div className="stat-value">{value}</div>
                <div className="stat-label">{label}</div>
            </div>
        </div>
    );
}
