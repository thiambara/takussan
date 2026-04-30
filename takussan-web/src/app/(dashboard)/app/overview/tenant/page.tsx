import { getMeAction } from '@/app/actions/auth';
import { fetchTenantDashboard } from '@/lib/queries/dashboard';
import { StatCard } from '@/components/charts/StatCard';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';

/** TCK-032 P1 — tenant dashboard. Any authenticated user can view. */
export default async function TenantDashboardPage() {
  await getMeAction();

  const payload = await fetchTenantDashboard();
  if (!payload) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-app-ink">Ma situation</h1>
        <p className="text-sm text-app-ink-muted">Impossible de charger les données.</p>
      </div>
    );
  }
  const data = payload.data;

  if (!data.has_customer_profile) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-app-ink">Ma situation</h1>
        <p className="text-sm text-app-ink-muted">
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
        <h1 className="text-2xl font-bold text-app-ink">Ma situation</h1>
        <p className="mt-1 text-sm text-app-ink-muted">
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

      <section className="rounded-2xl bg-app-surface-1 p-6">
        <h2 className="mb-3 text-base font-semibold text-app-ink">Échéances des 30 prochains jours</h2>
        {data.payments.upcoming_30d.length === 0 ? (
          <p className="text-sm text-app-ink-muted">Aucune échéance prévue.</p>
        ) : (
          <ul className="divide-y divide-app-surface-3">
            {data.payments.upcoming_30d.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-app-ink">
                  {p.due_date ? formatDate(p.due_date, 'fr') : '—'}
                </span>
                <span className="font-semibold text-app-ink">
                  {formatCurrency(p.amount, 'fr')}
                </span>
                <span className="text-xs text-app-ink-muted">{p.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl bg-app-surface-1 p-6">
        <h2 className="mb-3 text-base font-semibold text-app-ink">Documents récents</h2>
        {data.documents.recent.length === 0 ? (
          <p className="text-sm text-app-ink-muted">Aucun document.</p>
        ) : (
          <ul className="divide-y divide-app-surface-3">
            {data.documents.recent.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-app-ink">{d.name}</span>
                <span className="text-xs text-app-ink-muted">{d.type ?? '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
