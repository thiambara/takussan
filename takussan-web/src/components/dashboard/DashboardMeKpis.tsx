import { StatCard } from '@/components/charts/StatCard';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import type { DashboardMeNextPayment, DashboardMeRecentDocument, DashboardMeRole } from '@/lib/queries/dashboard-me';

type Props = {
  role: DashboardMeRole;
  metrics: Record<string, unknown>;
};

const PLACEHOLDER = '—';

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  return null;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function displayNumber(value: unknown): string {
  const n = asNumber(value);
  return n === null ? PLACEHOLDER : formatNumber(n, 'fr');
}

function displayCurrency(value: unknown): string {
  const n = asNumber(value);
  return n === null ? PLACEHOLDER : formatCurrency(n, 'fr');
}

export function DashboardMeKpis({ role, metrics }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {role === 'agency_admin' && <AgencyTiles metrics={metrics} />}
      {role === 'owner' && <OwnerTiles metrics={metrics} />}
      {role === 'agent' && <AgentTiles metrics={metrics} />}
      {role === 'tenant' && <TenantTiles metrics={metrics} />}
    </div>
  );
}

function AgencyTiles({ metrics }: { metrics: Record<string, unknown> }) {
  const overdue = asNumber(metrics.overdue_count) ?? 0;
  return (
    <>
      <StatCard label="Biens" value={displayNumber(metrics.properties_total)} />
      <StatCard label="Baux actifs" value={displayNumber(metrics.leases_active)} accent="success" />
      <StatCard label="Revenus du mois" value={displayCurrency(metrics.revenue_month)} accent="success" />
      <StatCard
        label="Impayés"
        value={displayNumber(metrics.overdue_count)}
        accent={overdue > 0 ? 'warning' : 'default'}
      />
    </>
  );
}

function OwnerTiles({ metrics }: { metrics: Record<string, unknown> }) {
  const overdueAmount = asNumber(metrics.overdue_amount) ?? 0;
  return (
    <>
      <StatCard label="Portefeuille" value={displayNumber(metrics.portfolio_total)} />
      <StatCard label="Baux actifs" value={displayNumber(metrics.leases_active)} accent="success" />
      <StatCard label="Cashflow du mois" value={displayCurrency(metrics.cashflow_month)} accent="success" />
      <StatCard
        label="Impayés"
        value={displayCurrency(metrics.overdue_amount)}
        accent={overdueAmount > 0 ? 'danger' : 'default'}
      />
    </>
  );
}

function AgentTiles({ metrics }: { metrics: Record<string, unknown> }) {
  const overdueTasks = asNumber(metrics.tasks_overdue) ?? 0;
  return (
    <>
      <StatCard label="Biens gérés" value={displayNumber(metrics.properties_managed)} />
      <StatCard label="Pipeline" value={displayNumber(metrics.pipeline_total)} />
      <StatCard
        label="Tâches ouvertes"
        value={displayNumber(metrics.tasks_open)}
        hint={overdueTasks > 0 ? `${overdueTasks} en retard` : undefined}
        accent={overdueTasks > 0 ? 'warning' : 'default'}
      />
      <StatCard label="Commissions du mois" value={displayCurrency(metrics.commissions_month)} accent="success" />
    </>
  );
}

function TenantTiles({ metrics }: { metrics: Record<string, unknown> }) {
  const nextPayment = (metrics.next_payment ?? null) as DashboardMeNextPayment | null;
  const overdueAmount = asNumber(metrics.overdue_amount) ?? 0;
  const docs = asArray<DashboardMeRecentDocument>(metrics.recent_documents);
  return (
    <>
      <StatCard label="Baux actifs" value={displayNumber(metrics.leases_active)} />
      <StatCard
        label="Prochaine échéance"
        value={nextPayment ? formatCurrency(nextPayment.amount, 'fr') : PLACEHOLDER}
        hint={nextPayment?.due_date ? formatDate(nextPayment.due_date, 'fr') : undefined}
      />
      <StatCard
        label="Impayés"
        value={displayCurrency(metrics.overdue_amount)}
        accent={overdueAmount > 0 ? 'danger' : 'default'}
      />
      <StatCard label="Documents récents" value={formatNumber(docs.length, 'fr')} />
    </>
  );
}
