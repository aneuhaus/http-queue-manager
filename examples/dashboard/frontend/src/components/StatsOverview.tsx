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

type StatCardProps = {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
};

export function StatsOverview() {
  const { data, loading, error } = useQuery(GET_STATS, {
    pollInterval: 2000,
  });

  if (loading) return <div>Loading stats...</div>;
  if (error) return <div>Error loading stats</div>;

  const stats = data?.overallStats || {};

  return (
    <div className="flex-col gap-4">
      <StatCard 
        icon={<Activity className="text-yellow-400" />} 
        label="Processing" 
        value={stats.processing} 
        color="#fbbf24"
      />
      <StatCard 
        icon={<Clock className="text-blue-400" />} 
        label="Pending" 
        value={stats.pending} 
        color="#60a5fa"
      />
      <StatCard 
        icon={<CheckCircle className="text-green-400" />} 
        label="Completed" 
        value={stats.completed} 
        color="#34d399"
      />
      <StatCard 
        icon={<AlertOctagon className="text-red-400" />} 
        label="Failed" 
        value={stats.failed} 
        color="#f87171"
      />
      <StatCard 
        icon={<Skull className="text-gray-400" />} 
        label="Dead Letter" 
        value={stats.dead} 
        color="#94a3b8"
      />
      
      <div className="glass-panel p-4 mt-4">
        <div className="text-sm text-secondary">Success Rate</div>
        <div className="text-lg">{(stats.successRate * 100).toFixed(1)}%</div>
      </div>
      
      <div className="glass-panel p-4">
        <div className="text-sm text-secondary">Avg Time</div>
        <div className="text-lg">{Math.round(stats.avgProcessingTime)} ms</div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: StatCardProps) {
  return (
    <div className="glass-panel stat-card" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="stat-icon" style={{ color }}>{icon}</div>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}
