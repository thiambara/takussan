import { useLocale, useTranslations } from 'next-intl';

import { StatCard } from '@/components/charts/StatCard';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/config';
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

function displayNumber(value: unknown, locale: Locale): string {
  const n = asNumber(value);
  return n === null ? PLACEHOLDER : formatNumber(n, locale);
}

function displayCurrency(value: unknown, locale: Locale): string {
  const n = asNumber(value);
  return n === null ? PLACEHOLDER : formatCurrency(n, locale);
}

/**
 * P127.06 (TCK-1363) — les chiffres suivent la locale ACTIVE, comme `LineChart` (TCK-374) : `'fr'`
 * était écrite en dur, quelle que soit la langue de l'interface.
 */
function useLocaleActive(): Locale {
  const brute = useLocale();
  return isLocale(brute) ? brute : DEFAULT_LOCALE;
}

export function DashboardMeKpis({ role, metrics }: Props) {
  return (
    // `tabular-nums` est HÉRITÉ (font-variant-numeric) : posé sur la grille, il atteint la valeur
    // de chaque tuile sans toucher à `charts/StatCard`, que d'autres tableaux de bord partagent.
    <div className="grid grid-cols-2 gap-4 tabular-nums lg:grid-cols-4">
      {role === 'agency_admin' && <AgencyTiles metrics={metrics} />}
      {role === 'owner' && <OwnerTiles metrics={metrics} />}
      {role === 'agent' && <AgentTiles metrics={metrics} />}
      {role === 'tenant' && <TenantTiles metrics={metrics} />}
    </div>
  );
}

function AgencyTiles({ metrics }: { metrics: Record<string, unknown> }) {
  const t = useTranslations('dashboard.me');
  const locale = useLocaleActive();
  const overdue = asNumber(metrics.overdue_count) ?? 0;
  return (
    <>
      <StatCard label={t('properties')} value={displayNumber(metrics.properties_total, locale)} />
      <StatCard label={t('activeLeases')} value={displayNumber(metrics.leases_active, locale)} accent="success" />
      {/* TCK-595 (verif-595 M1) — les chiffres consolidés n'arrivent que sous `reports.view_agency` :
          sans la clé, la tuile n'est pas rendue (un « — » laisserait croire à une donnée absente). */}
      {'revenue_month' in metrics ? (
        <StatCard label={t('revenueMonth')} value={displayCurrency(metrics.revenue_month, locale)} accent="success" />
      ) : null}
      {'overdue_count' in metrics ? (
        <StatCard
          label={t('overdue')}
          value={displayNumber(metrics.overdue_count, locale)}
          accent={overdue > 0 ? 'warning' : 'default'}
        />
      ) : null}
    </>
  );
}

function OwnerTiles({ metrics }: { metrics: Record<string, unknown> }) {
  const t = useTranslations('dashboard.me');
  const locale = useLocaleActive();
  const overdueAmount = asNumber(metrics.overdue_amount) ?? 0;
  return (
    <>
      <StatCard label={t('portfolio')} value={displayNumber(metrics.portfolio_total, locale)} />
      <StatCard label={t('activeLeases')} value={displayNumber(metrics.leases_active, locale)} accent="success" />
      <StatCard label={t('cashflowMonth')} value={displayCurrency(metrics.cashflow_month, locale)} accent="success" />
      <StatCard
        label={t('overdue')}
        value={displayCurrency(metrics.overdue_amount, locale)}
        accent={overdueAmount > 0 ? 'danger' : 'default'}
      />
    </>
  );
}

function AgentTiles({ metrics }: { metrics: Record<string, unknown> }) {
  const t = useTranslations('dashboard.me');
  const locale = useLocaleActive();
  const overdueTasks = asNumber(metrics.tasks_overdue) ?? 0;
  return (
    <>
      <StatCard label={t('managed')} value={displayNumber(metrics.properties_managed, locale)} />
      <StatCard label={t('pipeline')} value={displayNumber(metrics.pipeline_total, locale)} />
      <StatCard
        label={t('openTasks')}
        value={displayNumber(metrics.tasks_open, locale)}
        hint={overdueTasks > 0 ? t('overdueTasksHint', { count: String(overdueTasks) }) : undefined}
        accent={overdueTasks > 0 ? 'warning' : 'default'}
      />
      <StatCard label={t('commissionsMonth')} value={displayCurrency(metrics.commissions_month, locale)} accent="success" />
    </>
  );
}

function TenantTiles({ metrics }: { metrics: Record<string, unknown> }) {
  const t = useTranslations('dashboard.me');
  const locale = useLocaleActive();
  const nextPayment = (metrics.next_payment ?? null) as DashboardMeNextPayment | null;
  const overdueAmount = asNumber(metrics.overdue_amount) ?? 0;
  const docs = asArray<DashboardMeRecentDocument>(metrics.recent_documents);
  return (
    <>
      <StatCard label={t('activeLeases')} value={displayNumber(metrics.leases_active, locale)} />
      <StatCard
        label={t('nextDue')}
        value={nextPayment ? formatCurrency(nextPayment.amount, locale) : PLACEHOLDER}
        hint={nextPayment?.due_date ? formatDate(nextPayment.due_date, locale) : undefined}
      />
      <StatCard
        label={t('overdue')}
        value={displayCurrency(metrics.overdue_amount, locale)}
        accent={overdueAmount > 0 ? 'danger' : 'default'}
      />
      <StatCard label={t('recentDocs')} value={formatNumber(docs.length, locale)} />
    </>
  );
}
