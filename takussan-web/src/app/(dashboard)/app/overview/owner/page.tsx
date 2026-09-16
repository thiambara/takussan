import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { fetchOwnerDashboard } from '@/lib/queries/dashboard';
import { StatCard } from '@/components/charts/StatCard';
import { LineChart } from '@/components/charts/LineChart';
import { formatCurrency, formatDate, formatNumber, formatPercent } from '@/lib/format';
import { buttonVariants } from '@/components/ui/button';
import Link from 'next/link';
import { apiRequest, buildQueryString } from '@/lib/api';
import { getToken } from '@/lib/session';
import type { PaginatedResponse } from '@/types/api';
import type { Payout } from '@/types/invoice';
import { PageHeader } from '@/components/console';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.overviewOwner');
  return { title: t('metaTitle') };
}

/** TCK-032 P1 — owner (landlord) dashboard. */
export default async function OwnerDashboardPage() {
  const t = await getTranslations('dashboard.owner');
  // TCK-426 — le refus de rôle est REMONTÉ dans le `layout.tsx` de ce segment : ici, sous le
  // `loading.tsx`, son `redirect()` rendait 200 + le squelette de la vue interdite.

  const payload = await fetchOwnerDashboard();
  if (!payload) {
    return (
      <PageHeader title={t('title')} description={t('loadError')} />
    );
  }
  const data = payload.data;
  const ts = payload.timeseries;
  const pendingPayouts = await fetchPendingOwnerPayouts(data.owner_id);

  return (
    <div className="space-y-6">
      {/* Dates lisibles (« 1 sept. 2026 »), comme la vue agent — plus l'ISO brut. */}
      <PageHeader title={t('title')} description={t('subtitle', {
            start: formatDate(data.period.start, 'fr'),
            end: formatDate(data.period.end, 'fr'),
          })} />

      {(data.portfolio?.total ?? 0) === 0 && (
        <section className="rounded-2xl border border-dashed border-border bg-card p-6">
          <h2 className="text-base font-semibold text-foreground">{t('emptyTitle')}</h2>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">{t('emptyBodyFull')}</p>
          <Link href="/app/properties/new" className={buttonVariants({ className: 'mt-4' })}>
            {t('emptyCta')}
          </Link>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 tabular-nums sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('properties')}
          value={formatNumber(data.portfolio?.total ?? 0, 'fr')}
          hint={t('propertiesHint', {
            rented: data.portfolio?.rented ?? 0,
            available: data.portfolio?.available ?? 0,
          })}
        />
        <StatCard
          label={t('activeLeases')}
          value={formatNumber(data.leases?.active ?? 0, 'fr')}
        />
        <StatCard
          label={t('cashflowMonth')}
          value={formatCurrency(data.finance?.cashflow_month ?? 0, 'fr')}
          hint={t('expectedHint', {
            amount: formatCurrency(data.finance?.expected_monthly ?? 0, 'fr'),
          })}
          accent="success"
        />
        <StatCard
          label={t('overdue')}
          value={formatNumber(data.finance?.overdue_count ?? 0, 'fr')}
          hint={formatCurrency(data.finance?.overdue_amount ?? 0, 'fr')}
          accent={(data.finance?.overdue_count ?? 0) > 0 ? 'warning' : 'default'}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 tabular-nums sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('occupancy')}
          // « 22,67 % » et non « 22.67% » : séparateur décimal et espace de la locale.
          value={formatPercent((data.occupancy?.rate_percent ?? 0) / 100, 'fr')}
        />
        <StatCard
          label={t('pendingBookings')}
          value={formatNumber(data.bookings?.pending ?? 0, 'fr')}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl bg-card p-5">
          <h2 className="text-base font-semibold text-foreground">{t('portfolio')}</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <DashboardLine label={t('available')} value={formatNumber(data.portfolio?.available ?? 0, 'fr')} />
            <DashboardLine label={t('rented')} value={formatNumber(data.portfolio?.rented ?? 0, 'fr')} />
            <DashboardLine
              label={t('otherStatuses')}
              value={formatNumber(
                Math.max((data.portfolio?.total ?? 0) - (data.portfolio?.available ?? 0) - (data.portfolio?.rented ?? 0), 0),
                'fr',
              )}
            />
          </dl>
        </section>

        <section className="rounded-2xl bg-card p-5">
          <h2 className="text-base font-semibold text-foreground">{t('pendingRequests')}</h2>
          <div className="mt-4 space-y-2 text-sm">
            <DashboardLinkLine
              href="/app/bookings?status=pending"
              label={t('bookingsToHandle')}
              value={formatNumber(data.bookings?.pending ?? 0, 'fr')}
            />
            <DashboardLinkLine
              href="/app/maintenance"
              label={t('maintenanceQuotes')}
              value={t('seeModule')}
            />
          </div>
        </section>

        <section className="rounded-2xl bg-card p-5">
          <h2 className="text-base font-semibold text-foreground">{t('nextPayouts')}</h2>
          {pendingPayouts.length > 0 ? (
            <ul className="mt-4 space-y-2 text-sm">
              {pendingPayouts.map((payout) => (
                <li key={payout.id} className="rounded-lg bg-muted/60 p-3">
                  <p className="font-medium text-foreground tabular-nums">
                    {formatCurrency(payout.net_amount, 'fr', { currency: payout.currency ?? 'XOF' })}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {payout.reference_number ?? t('payoutFallback', { id: payout.id })}
                    {payout.scheduled_at
                      ? t('payoutScheduled', { date: formatDate(payout.scheduled_at, 'fr') })
                      : ''}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-pretty text-muted-foreground">{t('noPayouts')}</p>
          )}
        </section>
      </div>

      {ts && (
        <section className="rounded-2xl bg-card p-6">
          <LineChart
            title={t('chartTitle')}
            data={{
              labels: ts.months,
              series: [
                {
                  name: t('chartCashflow'),
                  values: (ts.cashflow as number[]) ?? [],
                  color: 'stroke-chart-1',
                },
                {
                  name: t('chartOccupancy'),
                  values: (ts.occupancy as number[]) ?? [],
                  color: 'stroke-chart-2',
                },
              ],
            }}
          />
        </section>
      )}
    </div>
  );
}

function DashboardLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold text-foreground tabular-nums">{value}</dd>
    </div>
  );
}

function DashboardLinkLine({
  href,
  label,
  value,
}: {
  href: string;
  label: string;
  value: string;
}) {
  return (
    <Link
      href={href}
      // `bg-card/70` sur une carte `bg-card` ne se voyait pas : la ligne n'avait ni fond ni
      // survol visibles. Même surface que les lignes de la vue agent.
      className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground tabular-nums">{value}</span>
    </Link>
  );
}

async function fetchPendingOwnerPayouts(ownerId: number): Promise<Payout[]> {
  const token = await getToken();
  if (!token) return [];
  const qs = buildQueryString({
    fields: {
      payouts: [
        'id',
        'reference_number',
        'landlord_id',
        'status',
        'net_amount',
        'currency',
        'scheduled_at',
        'created_at',
      ],
    },
    filter: { landlord_id: ownerId, status: 'pending' },
    sort: ['scheduled_at', '-created_at'],
    per_page: 3,
  });
  try {
    const response = await apiRequest<PaginatedResponse<Payout>>(
      `/api/payouts${qs ? `?${qs}` : ''}`,
      { token },
    );
    return response.data;
  } catch {
    return [];
  }
}
