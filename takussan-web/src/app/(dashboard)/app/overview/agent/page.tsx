import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { isAdmin, isAgent } from '@/lib/roles';
import { fetchAgentDashboard } from '@/lib/queries/dashboard';
import { StatCard } from '@/components/charts/StatCard';
import { BarChart } from '@/components/charts/BarChart';
import { LineChart } from '@/components/charts/LineChart';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import { PageHeader } from '@/components/console';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.agent');
  return { title: t('metaTitle') };
}

const ETAPES_PIPELINE_CONNUES = new Set([
  'lead', 'prospect', 'qualified', 'negotiating', 'converted', 'lost',
]);

const LOCALE: Locale = 'fr';

const PRIORITES_CONNUES = new Set(['low', 'normal', 'medium', 'high', 'urgent']);

/** TCK-032 P1 — agent dashboard. */
export default async function AgentDashboardPage() {
  const t = await getTranslations('dashboard.agent');
  const tStages = await getTranslations('dashboard.pipelineStages');
  const tPriority = await getTranslations('dashboard.taskPriority');
  const user = await getMeAction();
  if (!isAgent(user.roles) && !isAdmin(user.roles)) {
    redirect('/app/overview');
  }

  const payload = await fetchAgentDashboard();
  if (!payload) {
    return (
      <PageHeader title={t('title')} description={t('loadError')} />
    );
  }
  const data = payload.data;
  const ts = payload.timeseries;

  const pipelineEntries = Object.entries(data.pipeline ?? {});

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle', {
            start: formatDate(data.period.start, LOCALE),
            end: formatDate(data.period.end, LOCALE),
          })} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
        <StatCard
          label={t('managed')}
          value={formatNumber(data.properties_managed ?? 0, LOCALE)}
        />
        <StatCard
          label={t('commissionsMonth')}
          value={formatCurrency(data.finance?.commissions_month ?? 0, LOCALE)}
          accent="success"
        />
        <StatCard
          label={t('openTasks')}
          value={formatNumber(data.tasks?.open ?? 0, LOCALE)}
          hint={t('overdueHint', { count: data.tasks?.overdue ?? 0 })}
          accent={(data.tasks?.overdue ?? 0) > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label={t('visits7d')}
          value={formatNumber(data.visits?.upcoming_7d ?? 0, LOCALE)}
        />
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <OperationalWidget title={t('pipelinePriorities')}>
          <MetricLink
            href="/app/bookings"
            label={t('pendingRequests')}
            value={data.pipeline_ops?.pending_bookings ?? data.bookings?.pending ?? 0}
          />
          <MetricLink
            href="/app/leases"
            label={t('leasesToSign')}
            value={data.pipeline_ops?.leases_to_sign ?? 0}
          />
          <MetricLink
            href="/app/overview/agent"
            label={t('tasksToday')}
            value={data.pipeline_ops?.tasks_today ?? data.tasks?.today ?? 0}
          />
        </OperationalWidget>

        <OperationalWidget title={t('commissions')}>
          <p className="text-2xl font-semibold text-foreground">
            {formatCurrency(data.finance?.commissions_month ?? 0, LOCALE)}
          </p>
          <p className="text-sm text-muted-foreground">{t('thisMonth')}</p>
          <p className="mt-4 text-sm text-foreground">
            {t('yearToDate')}{' '}
            <span className="font-semibold">
              {formatCurrency(data.finance?.commissions_year ?? 0, LOCALE)}
            </span>
          </p>
        </OperationalWidget>

        <OperationalWidget title={t('todayVisits')}>
          {(data.visits?.today_items ?? []).length === 0 ? (
            <EmptyWidgetState message={t('noVisitsToday')} />
          ) : (
            <ul className="space-y-3">
              {(data.visits?.today_items ?? []).map((visit) => (
                <li key={visit.id} className="text-sm">
                  <Link href={`/app/visits/${visit.id}`} className="font-semibold text-foreground hover:text-primary">
                    {formatTime(visit.scheduled_at, t('timeUnknown'))} · {visit.property?.title ?? t('propertyFallback')}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {visit.requester?.name ?? t('requesterUnknown')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </OperationalWidget>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <OperationalWidget title={t('assignedTasks')}>
          {(data.tasks?.items ?? []).length === 0 ? (
            <EmptyWidgetState message={t('noTasks')} />
          ) : (
            <ul className="space-y-3">
              {(data.tasks?.items ?? []).map((task) => (
                <li key={task.id} className="rounded-lg bg-muted p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{task.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {task.due_at
                          ? t('dueAt', { date: formatDateTime(task.due_at, t('dateUnknown')) })
                          : t('noDueDate')}
                      </p>
                    </div>
                    <span className="rounded-full bg-card px-2 py-1 text-xs text-muted-foreground">
                      {tPriority(
                        PRIORITES_CONNUES.has(task.priority ?? 'normal')
                          ? (task.priority ?? 'normal')
                          : 'normal',
                      )}
                    </span>
                  </div>
                  {task.customer ? (
                    <Link href={`/app/customers/${task.customer.id}`} className="mt-2 inline-block text-xs font-semibold text-primary">
                      {t('open')} {task.customer.name}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </OperationalWidget>

        <OperationalWidget title={t('recentActivity')}>
          {(data.recent_activity ?? []).length === 0 ? (
            <EmptyWidgetState message={t('noActivity')} />
          ) : (
            <ul className="space-y-3">
              {(data.recent_activity ?? []).map((activity) => (
                <li key={`${activity.type}-${activity.id}`} className="text-sm">
                  <p className="font-semibold text-foreground">{activity.label}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(activity.at, t('dateUnknown'))}</p>
                </li>
              ))}
            </ul>
          )}
        </OperationalWidget>
      </section>

      {pipelineEntries.length > 0 && (
        <section className="rounded-2xl bg-card p-6">
          <BarChart
            title={t('pipelineChart')}
            data={{
              labels: pipelineEntries.map(([k]) => (ETAPES_PIPELINE_CONNUES.has(k) ? tStages(k) : k)),
              series: [
                {
                  name: t('pipelineSeries'),
                  values: pipelineEntries.map(([, v]) => v),
                  color: 'fill-chart-2',
                },
              ],
            }}
          />
        </section>
      )}

      {ts && (
        <section className="rounded-2xl bg-card p-6">
          <LineChart
            title={t('chartTitle')}
            data={{
              labels: ts.months,
              series: [
                {
                  name: t('chartCommissions'),
                  values: (ts.commissions as number[]) ?? [],
                  color: 'stroke-chart-1',
                },
                {
                  name: t('chartSignedLeases'),
                  values: (ts.signed_leases as number[]) ?? [],
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

function OperationalWidget({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-card p-5">
      <h2 className="mb-4 text-base font-semibold text-foreground">{title}</h2>
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
    <Link href={href} className="mb-3 flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm hover:bg-muted/40">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{formatNumber(value, LOCALE)}</span>
    </Link>
  );
}

function EmptyWidgetState({ message }: { readonly message: string }) {
  return <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{message}</p>;
}

function formatTime(value: string | null, repli: string): string {
  if (!value) return repli;
  return new Intl.DateTimeFormat('fr-SN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function formatDateTime(value: string | null, repli: string): string {
  if (!value) return repli;
  return new Intl.DateTimeFormat('fr-SN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
