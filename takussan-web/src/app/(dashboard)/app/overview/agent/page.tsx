import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { getMeAction } from '@/app/actions/auth';
import { isAdmin, isAgent } from '@/lib/roles';
import { fetchAgentDashboard } from '@/lib/queries/dashboard';
import { StatCard } from '@/components/charts/StatCard';
import { BarChart } from '@/components/charts/BarChart';
import { LineChart } from '@/components/charts/LineChart';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import type { Locale } from '@/i18n/config';

export const metadata: Metadata = { title: 'Statistiques' };

const PIPELINE_LABELS: Record<string, string> = {
  lead: 'Leads',
  prospect: 'Prospects',
  qualified: 'Qualifiés',
  negotiating: 'Négociation',
  converted: 'Convertis',
  lost: 'Perdus',
};

const LOCALE: Locale = 'fr';

const TASK_PRIORITY_LABELS: Record<string, string> = {
  low: 'Faible',
  normal: 'Normale',
  medium: 'Normale',
  high: 'Élevée',
  urgent: 'Urgente',
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
          Pipeline CRM et activité — {formatDate(data.period.start, LOCALE)} au{' '}
          {formatDate(data.period.end, LOCALE)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Biens gérés"
          value={formatNumber(data.properties_managed ?? 0, LOCALE)}
        />
        <StatCard
          label="Commissions mois"
          value={formatCurrency(data.finance?.commissions_month ?? 0, LOCALE)}
          accent="success"
        />
        <StatCard
          label="Tâches ouvertes"
          value={formatNumber(data.tasks?.open ?? 0, LOCALE)}
          hint={`${data.tasks?.overdue ?? 0} en retard`}
          accent={(data.tasks?.overdue ?? 0) > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label="Visites 7j"
          value={formatNumber(data.visits?.upcoming_7d ?? 0, LOCALE)}
        />
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <OperationalWidget title="Priorités pipeline">
          <MetricLink
            href="/app/bookings"
            label="Demandes en attente"
            value={data.pipeline_ops?.pending_bookings ?? data.bookings?.pending ?? 0}
          />
          <MetricLink
            href="/app/leases"
            label="Baux à signer"
            value={data.pipeline_ops?.leases_to_sign ?? 0}
          />
          <MetricLink
            href="/app/overview/agent"
            label="Tâches du jour"
            value={data.pipeline_ops?.tasks_today ?? data.tasks?.today ?? 0}
          />
        </OperationalWidget>

        <OperationalWidget title="Commissions">
          <p className="text-2xl font-semibold text-app-ink">
            {formatCurrency(data.finance?.commissions_month ?? 0, LOCALE)}
          </p>
          <p className="text-sm text-app-ink-muted">Ce mois</p>
          <p className="mt-4 text-sm text-app-ink">
            Cumul annuel :{' '}
            <span className="font-semibold">
              {formatCurrency(data.finance?.commissions_year ?? 0, LOCALE)}
            </span>
          </p>
        </OperationalWidget>

        <OperationalWidget title="Visites du jour">
          {(data.visits?.today_items ?? []).length === 0 ? (
            <EmptyWidgetState message="Aucune visite prévue aujourd'hui." />
          ) : (
            <ul className="space-y-3">
              {(data.visits?.today_items ?? []).map((visit) => (
                <li key={visit.id} className="text-sm">
                  <Link href={`/app/visits/${visit.id}`} className="font-semibold text-app-ink hover:text-primary">
                    {formatTime(visit.scheduled_at)} · {visit.property?.title ?? 'Bien'}
                  </Link>
                  <p className="text-xs text-app-ink-muted">
                    {visit.requester?.name ?? 'Demandeur à préciser'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </OperationalWidget>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <OperationalWidget title="Tâches assignées">
          {(data.tasks?.items ?? []).length === 0 ? (
            <EmptyWidgetState message="Aucune tâche ouverte assignée." />
          ) : (
            <ul className="space-y-3">
              {(data.tasks?.items ?? []).map((task) => (
                <li key={task.id} className="rounded-lg bg-app-surface-2 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-app-ink">{task.title}</p>
                      <p className="text-xs text-app-ink-muted">
                        {task.due_at ? `Échéance ${formatDateTime(task.due_at)}` : 'Sans échéance'}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-2 py-1 text-xs text-app-ink-muted">
                      {TASK_PRIORITY_LABELS[task.priority ?? 'normal'] ?? 'Normale'}
                    </span>
                  </div>
                  {task.customer ? (
                    <Link href={`/app/customers/${task.customer.id}`} className="mt-2 inline-block text-xs font-semibold text-primary">
                      Ouvrir {task.customer.name}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </OperationalWidget>

        <OperationalWidget title="Activité récente">
          {(data.recent_activity ?? []).length === 0 ? (
            <EmptyWidgetState message="Aucune activité récente sur vos dossiers." />
          ) : (
            <ul className="space-y-3">
              {(data.recent_activity ?? []).map((activity) => (
                <li key={`${activity.type}-${activity.id}`} className="text-sm">
                  <p className="font-semibold text-app-ink">{activity.label}</p>
                  <p className="text-xs text-app-ink-muted">{formatDateTime(activity.at)}</p>
                </li>
              ))}
            </ul>
          )}
        </OperationalWidget>
      </section>

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

function OperationalWidget({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-app-surface-1 p-5">
      <h2 className="mb-4 text-base font-semibold text-app-ink">{title}</h2>
      {children}
    </section>
  );
}

function MetricLink({
  href,
  label,
  value,
}: {
  readonly href: string;
  readonly label: string;
  readonly value: number;
}) {
  return (
    <Link href={href} className="mb-3 flex items-center justify-between rounded-lg bg-app-surface-2 px-3 py-2 text-sm hover:bg-app-surface-3/40">
      <span className="text-app-ink-muted">{label}</span>
      <span className="font-semibold text-app-ink">{formatNumber(value, LOCALE)}</span>
    </Link>
  );
}

function EmptyWidgetState({ message }: { readonly message: string }) {
  return <p className="rounded-lg bg-app-surface-2 p-3 text-sm text-app-ink-muted">{message}</p>;
}

function formatTime(value: string | null): string {
  if (!value) return 'Heure à préciser';
  return new Intl.DateTimeFormat('fr-SN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function formatDateTime(value: string | null): string {
  if (!value) return 'Date à préciser';
  return new Intl.DateTimeFormat('fr-SN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
