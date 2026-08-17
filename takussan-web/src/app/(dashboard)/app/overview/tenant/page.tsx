import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { fetchTenantDashboard } from '@/lib/queries/dashboard';
import { StatCard } from '@/components/charts/StatCard';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';

// TCK-179 — les statuts de paiement bruts affichés sur le tableau de bord locataire.
// TCK-292 : la table de libellés est passée au dictionnaire (`dashboard.paymentStatus.*`) ;
// il ne reste ici que la liste des statuts CONNUS, pour ne pas rendre une clé sur un statut
// que le backend inventerait.
const STATUTS_CONNUS = new Set([
  'pending', 'paid', 'partially_paid', 'late', 'refunded', 'cancelled',
]);

function paymentStatusLabel(
  status: string | null | undefined,
  t: (cle: string) => string,
): string {
  if (!status) return '—';
  return STATUTS_CONNUS.has(status) ? t(`paymentStatus.${status}`) : status;
}

/** TCK-032 P1 — tenant dashboard. Any authenticated user can view. */
export default async function TenantDashboardPage() {
  const t = await getTranslations('dashboard');
  await getMeAction();

  const payload = await fetchTenantDashboard();
  if (!payload) {
    return (
      <div className="space-y-2">
        <h1 className="font-display text-2xl font-bold text-foreground">{t('tenant.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('tenant.loadError')}</p>
      </div>
    );
  }
  const data = payload.data;

  if (!data.has_customer_profile) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-2xl font-bold text-foreground">{t('tenant.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('tenant.noProfile')}</p>
      </div>
    );
  }

  const nextDue = data.payments.next_due;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">{t('tenant.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('tenant.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
        <StatCard label={t('tenant.activeLeases')} value={formatNumber(data.leases.active, 'fr')} />
        <StatCard
          label={t('tenant.nextRent')}
          value={nextDue ? formatCurrency(nextDue.amount, 'fr') : '—'}
          hint={nextDue?.due_date ? formatDate(nextDue.due_date, 'fr') : undefined}
        />
        <StatCard
          label={t('tenant.overdue')}
          value={formatNumber(data.payments.overdue_count, 'fr')}
          hint={formatCurrency(data.payments.overdue_amount, 'fr')}
          accent={data.payments.overdue_count > 0 ? 'danger' : 'default'}
        />
        <StatCard
          label={t('tenant.pendingBookings')}
          value={formatNumber(data.bookings.pending, 'fr')}
        />
      </div>

      <section className="rounded-2xl bg-card p-6">
        <h2 className="mb-3 text-base font-semibold text-foreground">{t('tenant.upcoming30d')}</h2>
        {data.payments.upcoming_30d.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('tenant.noUpcoming')}</p>
        ) : (
          <ul className="divide-y divide-app-surface-3">
            {data.payments.upcoming_30d.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-foreground">
                  {p.due_date ? formatDate(p.due_date, 'fr') : '—'}
                </span>
                <span className="font-semibold text-foreground">
                  {formatCurrency(p.amount, 'fr')}
                </span>
                <span className="text-xs text-muted-foreground">{paymentStatusLabel(p.status, t)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl bg-card p-6">
        <h2 className="mb-3 text-base font-semibold text-foreground">{t('tenant.recentDocs')}</h2>
        {data.documents.recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('tenant.noDocs')}</p>
        ) : (
          <ul className="divide-y divide-app-surface-3">
            {data.documents.recent.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-foreground">{d.name}</span>
                <span className="text-xs text-muted-foreground">{d.type ?? '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
