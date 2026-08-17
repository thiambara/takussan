'use client';

import { useLocale, useTranslations } from 'next-intl';
import { AlertCircle, FileText, Send, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';

import { useApiQuery } from '@/hooks/useApiQuery';
import {
  usePendingPayoutsCount,
  useDraftInvoicesCount,
} from '@/lib/queries/admin-finances';
import type {
  DashboardAgencyPayload,
  DashboardAgencySummary,
} from '@/lib/queries/dashboard-agency';
import { formatCurrency } from '@/lib/format';
import type { Locale } from '@/i18n/config';

/**
 * TCK-134 — 4-up KPI strip for `/admin/finances`. The 4 spec-mandated
 * tiles are wired as follows:
 *
 *   1. Encaissements du mois → `dashboard-agency.finance.revenue_month`
 *   2. Impayés en cours      → `dashboard-agency.finance.overdue_amount`
 *      (with `overdue_count` shown as a hint)
 *   3. Reversements en attente → `meta.total` of `/api/payouts?filter[status]=pending&per_page=1`
 *   4. Factures à émettre    → `meta.total` of `/api/invoices?filter[status]=draft&per_page=1`
 *
 * Per the spec ("Aucun montant n'est calculé côté frontend à partir de
 * listes paginées"), tiles 3-4 only consume `meta.total`, never the data
 * page itself — `per_page=1` ensures the upstream returns at most one row
 * for free.
 */

type DashboardAgencyResponse = DashboardAgencyPayload;

interface FinanceKpisProps {
  /**
   * Active profile id from `useMyProfiles`. When it changes (profile
   * switch via TCK-143), React Query rotates this into the queryKey, so
   * all four tiles refetch automatically without a page reload.
   */
  activeProfileId: string | null;
}

export function FinanceKpis({ activeProfileId }: FinanceKpisProps) {
  const t = useTranslations('admin.finances');
  const locale = useLocale() as Locale;

  const dashboardQuery = useApiQuery<DashboardAgencyResponse>(
    ['dashboard-agency', 'finance', activeProfileId],
    '/api/dashboard/agency',
    { staleTime: 30_000 },
  );
  const payoutsCountQuery = usePendingPayoutsCount();
  const invoicesCountQuery = useDraftInvoicesCount();

  const summary: DashboardAgencySummary | undefined = dashboardQuery.data?.data;
  const currency = 'XOF';

  return (
    <div
      data-testid="finance-kpis"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      <KpiTile
        icon={<TrendingUp className="size-5" aria-hidden="true" />}
        label={t('kpis.collections30d')}
        value={
          summary
            ? formatCurrency(summary.finance.revenue_month, locale, { currency })
            : null
        }
        loading={dashboardQuery.isLoading}
      />
      <KpiTile
        icon={<AlertCircle className="size-5" aria-hidden="true" />}
        label={t('kpis.overdue')}
        value={
          summary
            ? formatCurrency(summary.finance.overdue_amount, locale, { currency })
            : null
        }
        hint={
          summary
            ? `${summary.finance.overdue_count} bail${summary.finance.overdue_count > 1 ? 's' : ''} concerné${summary.finance.overdue_count > 1 ? 's' : ''}`
            : null
        }
        tone={summary && summary.finance.overdue_amount > 0 ? 'danger' : 'default'}
        loading={dashboardQuery.isLoading}
      />
      <KpiTile
        icon={<Send className="size-5" aria-hidden="true" />}
        label={t('kpis.pendingPayouts')}
        value={
          payoutsCountQuery.data
            ? String(payoutsCountQuery.data.meta.total)
            : null
        }
        loading={payoutsCountQuery.isLoading}
      />
      <KpiTile
        icon={<FileText className="size-5" aria-hidden="true" />}
        label={t('kpis.invoicesToIssue')}
        value={
          invoicesCountQuery.data
            ? String(invoicesCountQuery.data.meta.total)
            : null
        }
        loading={invoicesCountQuery.isLoading}
      />
    </div>
  );
}

interface KpiTileProps {
  readonly icon: ReactNode;
  readonly label: string;
  readonly value: string | null;
  readonly hint?: string | null;
  readonly loading?: boolean;
  readonly tone?: 'default' | 'danger';
}

function KpiTile({ icon, label, value, hint, loading, tone = 'default' }: KpiTileProps) {
  const ringClass =
    tone === 'danger'
      ? 'border-destructive/30 bg-destructive/5'
      : 'border-app-surface-2 bg-app-surface-1';

  return (
    <div
      className={`rounded-2xl border ${ringClass} p-4`}
      data-testid={`finance-kpi-${label.toLowerCase().replace(/\s+/g, '-').replace(/[()]/g, '')}`}
    >
      <div className="flex items-center justify-between text-app-ink-muted">
        <p className="text-xs font-medium uppercase tracking-wide">{label}</p>
        {icon}
      </div>
      <p className="mt-3 text-2xl font-bold text-app-ink">
        {loading ? <span aria-hidden="true">—</span> : (value ?? '—')}
      </p>
      {hint ? <p className="mt-1 text-xs text-app-ink-muted">{hint}</p> : null}
    </div>
  );
}
