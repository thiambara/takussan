import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';

export const metadata: Metadata = { title: 'Statistiques' };
import { isAdmin, isAgent } from '@/lib/roles';
import { redirect } from 'next/navigation';
import { fetchAgentDashboard } from '@/lib/queries/dashboard';
import { StatCard } from '@/components/charts/StatCard';
import { BarChart } from '@/components/charts/BarChart';
import { LineChart } from '@/components/charts/LineChart';
import { formatCurrency, formatNumber } from '@/lib/format';

const PIPELINE_LABELS: Record<string, string> = {
  lead: 'Leads',
  prospect: 'Prospects',
  qualified: 'Qualifiés',
  negotiating: 'Négociation',
  converted: 'Convertis',
  lost: 'Perdus',
};

/** TCK-032 P1 — agent dashboard. */
export default async function AgentDashboardPage() {
  const user = await getMeAction();
  if (!isAgent(user.roles) && !isAdmin(user.roles)) {
    redirect('/app/overview');
  }

  const payload = await fetchAgentDashboard();
  if (!payload) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-app-ink">Vue agent</h1>
        <p className="text-sm text-app-ink-muted">Impossible de charger les données.</p>
      </div>
    );
  }
  const data = payload.data;
  const ts = payload.timeseries;

  const pipelineEntries = Object.entries(data.pipeline ?? {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-app-ink">Vue agent</h1>
        <p className="mt-1 text-sm text-app-ink-muted">
          Pipeline CRM et activité — {data.period.start.slice(0, 10)} au{' '}
          {data.period.end.slice(0, 10)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Biens gérés"
          value={formatNumber(data.properties_managed ?? 0, 'fr')}
        />
        <StatCard
          label="Commissions mois"
          value={formatCurrency(data.finance?.commissions_month ?? 0, 'fr')}
          accent="success"
        />
        <StatCard
          label="Tâches ouvertes"
          value={formatNumber(data.tasks?.open ?? 0, 'fr')}
          hint={`${data.tasks?.overdue ?? 0} en retard`}
          accent={(data.tasks?.overdue ?? 0) > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label="Visites 7j"
          value={formatNumber(data.visits?.upcoming_7d ?? 0, 'fr')}
        />
      </div>

      {pipelineEntries.length > 0 && (
        <section className="rounded-2xl bg-app-surface-1 p-6">
          <BarChart
            title="Pipeline CRM"
            data={{
              labels: pipelineEntries.map(([k]) => PIPELINE_LABELS[k] ?? k),
              series: [
                {
                  name: 'Clients',
                  values: pipelineEntries.map(([, v]) => v),
                  color: 'fill-sky-500',
                },
              ],
            }}
          />
        </section>
      )}

      {ts && (
        <section className="rounded-2xl bg-app-surface-1 p-6">
          <LineChart
            title="Commissions et baux signés sur 12 mois"
            data={{
              labels: ts.months,
              series: [
                {
                  name: 'Commissions',
                  values: (ts.commissions as number[]) ?? [],
                  color: 'stroke-emerald-500',
                },
                {
                  name: 'Baux signés',
                  values: (ts.signed_leases as number[]) ?? [],
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
