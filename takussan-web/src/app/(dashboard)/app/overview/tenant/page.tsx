import { getMeAction } from '@/app/actions/auth';
import { fetchTenantDashboard } from '@/lib/queries/dashboard';
import { StatCard } from '@/components/charts/StatCard';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';

// TCK-179 — display the FR label for raw payment statuses surfaced on
// the tenant dashboard. Centralised here while a project-wide enum
// helper is still pending.
const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: 'À venir',
  paid: 'Payé',
  partially_paid: 'Partiellement payé',
  late: 'En retard',
  refunded: 'Remboursé',
  cancelled: 'Annulée',
};

function paymentStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  return PAYMENT_STATUS_LABEL[status] ?? status;
}

/** TCK-032 P1 — tenant dashboard. Any authenticated user can view. */
export default async function TenantDashboardPage() {
  await getMeAction();

  const payload = await fetchTenantDashboard();
  if (!payload) {
    return (
      <div className="space-y-2">
        <h1 className="font-display text-2xl font-bold text-foreground">Ma situation</h1>
        <p className="text-sm text-muted-foreground">Impossible de charger les données.</p>
      </div>
    );
  }
  const data = payload.data;

  if (!data.has_customer_profile) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-2xl font-bold text-foreground">Ma situation</h1>
        <p className="text-sm text-muted-foreground">
          Aucun profil locataire n&apos;est associé à votre compte. Contactez votre agence pour
          activer votre dossier.
        </p>
      </div>
    );
  }

  const nextDue = data.payments.next_due;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Ma situation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Prochaines échéances, documents et demandes en cours.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Baux actifs" value={formatNumber(data.leases.active, 'fr')} />
        <StatCard
          label="Prochain loyer"
          value={nextDue ? formatCurrency(nextDue.amount, 'fr') : '—'}
          hint={nextDue?.due_date ? formatDate(nextDue.due_date, 'fr') : undefined}
        />
        <StatCard
          label="Impayés"
          value={formatNumber(data.payments.overdue_count, 'fr')}
          hint={formatCurrency(data.payments.overdue_amount, 'fr')}
          accent={data.payments.overdue_count > 0 ? 'danger' : 'default'}
        />
        <StatCard
          label="Réservations en attente"
          value={formatNumber(data.bookings.pending, 'fr')}
        />
      </div>

      <section className="rounded-2xl bg-card p-6">
        <h2 className="mb-3 text-base font-semibold text-foreground">Échéances des 30 prochains jours</h2>
        {data.payments.upcoming_30d.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune échéance prévue.</p>
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
                <span className="text-xs text-muted-foreground">{paymentStatusLabel(p.status)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl bg-card p-6">
        <h2 className="mb-3 text-base font-semibold text-foreground">Documents récents</h2>
        {data.documents.recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun document.</p>
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
