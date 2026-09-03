import { useTranslations } from 'next-intl';

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
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {role === 'agency_admin' && <AgencyTiles metrics={metrics} />}
      {role === 'owner' && <OwnerTiles metrics={metrics} />}
      {role === 'agent' && <AgentTiles metrics={metrics} />}
      {role === 'tenant' && <TenantTiles metrics={metrics} />}
    </div>
  );
}

function AgencyTiles({ metrics }: { metrics: Record<string, unknown> }) {
  const t = useTranslations('dashboard.me');
  const overdue = asNumber(metrics.overdue_count) ?? 0;
  return (
    <>
      <StatCard label={t('properties')} value={displayNumber(metrics.properties_total)} />
      <StatCard label={t('activeLeases')} value={displayNumber(metrics.leases_active)} accent="success" />
      <StatCard label={t('revenueMonth')} value={displayCurrency(metrics.revenue_month)} accent="success" />
      <StatCard
        label={t('overdue')}
        value={displayNumber(metrics.overdue_count)}
        accent={overdue > 0 ? 'warning' : 'default'}
      />
    </>
  );
}

function OwnerTiles({ metrics }: { metrics: Record<string, unknown> }) {
  const t = useTranslations('dashboard.me');
  const overdueAmount = asNumber(metrics.overdue_amount) ?? 0;
  return (
    <>
      <StatCard label={t('portfolio')} value={displayNumber(metrics.portfolio_total)} />
      <StatCard label={t('activeLeases')} value={displayNumber(metrics.leases_active)} accent="success" />
      <StatCard label={t('cashflowMonth')} value={displayCurrency(metrics.cashflow_month)} accent="success" />
      <StatCard
        label={t('overdue')}
        value={displayCurrency(metrics.overdue_amount)}
        accent={overdueAmount > 0 ? 'danger' : 'default'}
      />
    </>
  );
}

function AgentTiles({ metrics }: { metrics: Record<string, unknown> }) {
  const t = useTranslations('dashboard.me');
  const overdueTasks = asNumber(metrics.tasks_overdue) ?? 0;
  return (
    <>
      <StatCard label={t('managed')} value={displayNumber(metrics.properties_managed)} />
      <StatCard label={t('pipeline')} value={displayNumber(metrics.pipeline_total)} />
      <StatCard
        label={t('openTasks')}
        value={displayNumber(metrics.tasks_open)}
        hint={overdueTasks > 0 ? t('overdueTasksHint', { count: String(overdueTasks) }) : undefined}
        accent={overdueTasks > 0 ? 'warning' : 'default'}
      />
      <StatCard label={t('commissionsMonth')} value={displayCurrency(metrics.commissions_month)} accent="success" />
    </>
  );
}

function TenantTiles({ metrics }: { metrics: Record<string, unknown> }) {
  const t = useTranslations('dashboard.me');
  const nextPayment = (metrics.next_payment ?? null) as DashboardMeNextPayment | null;
  const overdueAmount = asNumber(metrics.overdue_amount) ?? 0;
  const docs = asArray<DashboardMeRecentDocument>(metrics.recent_documents);
  return (
    <>
      <StatCard label={t('activeLeases')} value={displayNumber(metrics.leases_active)} />
      <StatCard
        label={t('nextDue')}
        value={nextPayment ? formatCurrency(nextPayment.amount, 'fr') : PLACEHOLDER}
        hint={nextPayment?.due_date ? formatDate(nextPayment.due_date, 'fr') : undefined}
      />
      <StatCard
        label={t('overdue')}
        value={displayCurrency(metrics.overdue_amount)}
        accent={overdueAmount > 0 ? 'danger' : 'default'}
      />
      <StatCard label={t('recentDocs')} value={formatNumber(docs.length, 'fr')} />
    </>
  );
}
