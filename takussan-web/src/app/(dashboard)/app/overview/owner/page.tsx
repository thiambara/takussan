import { getMeAction } from '@/app/actions/auth';
import { isAdmin, isOwner } from '@/lib/roles';
import { redirect } from 'next/navigation';
import { fetchOwnerDashboard } from '@/lib/queries/dashboard';
import { StatCard } from '@/components/charts/StatCard';
import { LineChart } from '@/components/charts/LineChart';
import { formatCurrency, formatNumber } from '@/lib/format';
import Link from 'next/link';
import { apiRequest, buildQueryString } from '@/lib/api';
import { getToken } from '@/lib/session';
import type { PaginatedResponse } from '@/types/api';
import type { Payout } from '@/types/invoice';

/** TCK-032 P1 — owner (landlord) dashboard. */
export default async function OwnerDashboardPage() {
  const user = await getMeAction();
  if (!isOwner(user.roles) && !isAdmin(user.roles)) {
    redirect('/app/overview');
  }

  const payload = await fetchOwnerDashboard();
  if (!payload) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-app-ink">Vue bailleur</h1>
        <p className="text-sm text-app-ink-muted">Impossible de charger les données.</p>
      </div>
    );
  }
  const data = payload.data;
  const ts = payload.timeseries;
  const pendingPayouts = await fetchPendingOwnerPayouts(data.owner_id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-app-ink">Vue bailleur</h1>
        <p className="mt-1 text-sm text-app-ink-muted">
          Mon portefeuille — {data.period.start.slice(0, 10)} au {data.period.end.slice(0, 10)}
        </p>
      </div>

      {(data.portfolio?.total ?? 0) === 0 && (
        <section className="rounded-2xl border border-dashed border-stone-200 bg-white p-6">
          <h2 className="text-base font-semibold text-app-ink">Aucun bien dans votre portefeuille</h2>
          <p className="mt-1 text-sm text-app-ink-muted">
            Ajoutez votre premier bien pour activer les réservations, baux, documents et demandes de maintenance.
          </p>
          <Link
            href="/app/properties/new"
            className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Ajouter un bien
          </Link>
        </section>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Biens"
          value={formatNumber(data.portfolio?.total ?? 0, 'fr')}
          hint={`${data.portfolio?.rented ?? 0} loués · ${data.portfolio?.available ?? 0} dispo.`}
        />
        <StatCard
          label="Baux actifs"
          value={formatNumber(data.leases?.active ?? 0, 'fr')}
        />
        <StatCard
          label="Cashflow du mois"
          value={formatCurrency(data.finance?.cashflow_month ?? 0, 'fr')}
          hint={`Attendu : ${formatCurrency(data.finance?.expected_monthly ?? 0, 'fr')}`}
          accent="success"
        />
        <StatCard
          label="Impayés"
          value={formatNumber(data.finance?.overdue_count ?? 0, 'fr')}
          hint={formatCurrency(data.finance?.overdue_amount ?? 0, 'fr')}
          accent={(data.finance?.overdue_count ?? 0) > 0 ? 'warning' : 'default'}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Taux d'occupation"
          value={`${data.occupancy?.rate_percent ?? 0}%`}
        />
        <StatCard
          label="Réservations en attente"
          value={formatNumber(data.bookings?.pending ?? 0, 'fr')}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl bg-app-surface-1 p-5">
          <h2 className="text-sm font-semibold text-app-ink">Portefeuille</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <DashboardLine label="Disponibles" value={formatNumber(data.portfolio?.available ?? 0, 'fr')} />
            <DashboardLine label="Loués" value={formatNumber(data.portfolio?.rented ?? 0, 'fr')} />
            <DashboardLine
              label="Autres statuts"
              value={formatNumber(
                Math.max((data.portfolio?.total ?? 0) - (data.portfolio?.available ?? 0) - (data.portfolio?.rented ?? 0), 0),
                'fr',
              )}
            />
          </dl>
        </section>

        <section className="rounded-2xl bg-app-surface-1 p-5">
          <h2 className="text-sm font-semibold text-app-ink">Demandes en attente</h2>
          <div className="mt-4 space-y-3 text-sm">
            <DashboardLinkLine
              href="/app/bookings?status=pending"
              label="Réservations à traiter"
              value={formatNumber(data.bookings?.pending ?? 0, 'fr')}
            />
            <DashboardLinkLine
              href="/app/maintenance"
              label="Maintenance et devis"
              value="Voir le module"
            />
          </div>
        </section>

        <section className="rounded-2xl bg-app-surface-1 p-5">
          <h2 className="text-sm font-semibold text-app-ink">Prochains reversements</h2>
          {pendingPayouts.length > 0 ? (
            <ul className="mt-4 space-y-2 text-sm">
              {pendingPayouts.map((payout) => (
                <li key={payout.id} className="rounded-lg bg-white/70 p-3">
                  <p className="font-medium text-app-ink">
                    {formatCurrency(payout.net_amount, 'fr', { currency: payout.currency ?? 'XOF' })}
                  </p>
                  <p className="mt-0.5 text-xs text-app-ink-muted">
                    {payout.reference_number ?? `Reversement #${payout.id}`}
                    {payout.scheduled_at ? ` · prévu le ${payout.scheduled_at.slice(0, 10)}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-app-ink-muted">
              Aucun reversement à venir retourné par l’API.
            </p>
          )}
        </section>
      </div>

      {ts && (
        <section className="rounded-2xl bg-app-surface-1 p-6">
          <LineChart
            title="Cashflow et occupation sur 12 mois"
            data={{
              labels: ts.months,
              series: [
                {
                  name: 'Cashflow',
                  values: (ts.cashflow as number[]) ?? [],
                  color: 'stroke-emerald-500',
                },
                {
                  name: 'Occupation (%)',
                  values: (ts.occupancy as number[]) ?? [],
                  color: 'stroke-sky-500',
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
      <dt className="text-app-ink-muted">{label}</dt>
      <dd className="font-semibold text-app-ink">{value}</dd>
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
      className="flex items-center justify-between gap-3 rounded-lg bg-white/70 p-3 hover:bg-white"
    >
      <span className="text-app-ink-muted">{label}</span>
      <span className="font-semibold text-app-ink">{value}</span>
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
