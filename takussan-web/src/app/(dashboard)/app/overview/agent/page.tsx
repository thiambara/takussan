import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { getTranslations } from 'next-intl/server';

import {
  fetchAgentDashboard,
  fetchMyCapabilities,
  type AgentDashboardScope,
} from '@/lib/queries/dashboard';
import { StatCard } from '@/components/charts/StatCard';
import { BarChart } from '@/components/charts/BarChart';
import { LineChart } from '@/components/charts/LineChart';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import { localeDeLaRequete } from '@/i18n/locale-serveur';
import { PageHeader } from '@/components/console';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.agent');
  return { title: t('metaTitle') };
}

const ETAPES_PIPELINE_CONNUES = new Set([
  'lead', 'prospect', 'qualified', 'negotiating', 'converted', 'lost',
]);

const PRIORITES_CONNUES = new Set(['low', 'normal', 'medium', 'high', 'urgent']);

/**
 * TCK-595 (ADR-0049 §4) — « Mes chiffres » par défaut ; « Agence » seulement pour qui détient
 * `reports.view_agency`. Un `?scope=agency` saisi à la main sans la capacité retombe sur la vue
 * personnelle au lieu de rendre l'erreur de l'API.
 */
const CAPACITE_AGENCE = 'reports.view_agency';

type Props = {
  readonly searchParams?: Promise<{ scope?: string | string[] }>;
};

/** TCK-032 P1 — agent dashboard. */
export default async function AgentDashboardPage({ searchParams }: Props = {}) {
  const t = await getTranslations('dashboard.agent');
  const tStages = await getTranslations('dashboard.pipelineStages');
  const tPriority = await getTranslations('dashboard.taskPriority');
  // TCK-426 — le refus de rôle est REMONTÉ dans le `layout.tsx` de ce segment : ici, sous le
  // `loading.tsx`, son `redirect()` rendait 200 + le squelette de la vue interdite.

  const [params, capacites, locale] = await Promise.all([
    searchParams ?? Promise.resolve<{ scope?: string | string[] }>({}),
    fetchMyCapabilities(),
    localeDeLaRequete(),
  ]);
  const peutVoirAgence = capacites.includes(CAPACITE_AGENCE);
  const scope: AgentDashboardScope = params.scope === 'agency' && peutVoirAgence ? 'agency' : 'mine';

  const payload = await fetchAgentDashboard({ scope });
  if (!payload) {
    return (
      <PageHeader title={t('title')} description={t('loadError')} />
    );
  }
  const data = payload.data;
  const ts = payload.timeseries;
  const agence = (data.scope ?? scope) === 'agency';

  const pipelineEntries = Object.entries(data.pipeline ?? {});

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle', {
            start: formatDate(data.period.start, locale),
            end: formatDate(data.period.end, locale),
          })} />

      {peutVoirAgence ? <BasculePortee agence={agence} t={t} /> : null}

      <div className="grid grid-cols-1 gap-4 tabular-nums sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={agence ? t('managedAgency') : t('managedMine')}
          value={formatNumber(data.properties_managed ?? 0, locale)}
        />
        <StatCard
          label={agence ? t('commissionsMonthAgency') : t('commissionsMonthMine')}
          value={formatCurrency(data.finance?.commissions_month ?? 0, locale)}
          accent="success"
        />
        <StatCard
          label={t('openTasks')}
          value={formatNumber(data.tasks?.open ?? 0, locale)}
          hint={t('overdueHint', { count: data.tasks?.overdue ?? 0 })}
          accent={(data.tasks?.overdue ?? 0) > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label={t('visits7d')}
          value={formatNumber(data.visits?.upcoming_7d ?? 0, locale)}
        />
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <OperationalWidget title={t('pipelinePriorities')}>
          <MetricLink
            href="/app/bookings"
            label={t('pendingRequests')}
            value={data.pipeline_ops?.pending_bookings ?? data.bookings?.pending ?? 0}
            locale={locale}
          />
          <MetricLink
            href="/app/leases"
            label={t('leasesToSign')}
            value={data.pipeline_ops?.leases_to_sign ?? 0}
            locale={locale}
          />
          {/* TCK-591 — menait à cette page elle-même. */}
          <MetricLink
            href="/app/tasks?filter[due]=today"
            label={t('tasksToday')}
            value={data.pipeline_ops?.tasks_today ?? data.tasks?.today ?? 0}
            locale={locale}
          />
        </OperationalWidget>

        <OperationalWidget title={agence ? t('commissionsAgency') : t('commissions')}>
          <p className="text-2xl font-semibold text-foreground tabular-nums">
            {formatCurrency(data.finance?.commissions_month ?? 0, locale)}
          </p>
          <p className="text-sm text-muted-foreground">{t('thisMonth')}</p>
          <p className="mt-4 text-sm text-foreground">
            {t('yearToDate')}{' '}
            <span className="font-semibold tabular-nums">
              {formatCurrency(data.finance?.commissions_year ?? 0, locale)}
            </span>
          </p>
          {/* ADR-0049 §3 — le détail par bail vit dans le grand livre. */}
          <Link
            href="/app/commissions"
            className="mt-3 inline-block rounded-sm text-sm font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {t('commissionsDetail')}
          </Link>
        </OperationalWidget>

        <OperationalWidget title={t('todayVisits')}>
          {(data.visits?.today_items ?? []).length === 0 ? (
            <EmptyWidgetState message={t('noVisitsToday')} />
          ) : (
            <ul className="space-y-3">
              {(data.visits?.today_items ?? []).map((visit) => (
                <li key={visit.id} className="text-sm">
                  <Link href={`/app/visits/${visit.id}`} className="rounded-sm font-semibold text-foreground tabular-nums outline-none transition-colors hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50">
                    {formatTime(visit.scheduled_at, locale, t('timeUnknown'))} · {visit.property?.title ?? t('propertyFallback')}
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
                    <div className="min-w-0">
                      <p className="font-semibold text-pretty text-foreground">{task.title}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {task.due_at
                          ? t('dueAt', { date: formatDateTime(task.due_at, locale, t('dateUnknown')) })
                          : t('noDueDate')}
                      </p>
                    </div>
                    <span className="shrink-0 whitespace-nowrap rounded-full bg-card px-2 py-1 text-xs text-muted-foreground">
                      {tPriority(
                        PRIORITES_CONNUES.has(task.priority ?? 'normal')
                          ? (task.priority ?? 'normal')
                          : 'normal',
                      )}
                    </span>
                  </div>
                  {task.customer ? (
                    <Link href={`/app/customers/${task.customer.id}`} className="mt-2 inline-block rounded-sm text-xs font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
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
                  <p className="font-semibold text-pretty text-foreground">{activity.label}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{formatDateTime(activity.at, locale, t('dateUnknown'))}</p>
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
            orientation="horizontal"
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
            abscisses="mois"
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

function BasculePortee({
  agence,
  t,
}: {
  readonly agence: boolean;
  readonly t: (cle: string) => string;
}) {
  const onglet = 'inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50';
  const actif = 'bg-card text-foreground shadow-sm';
  const inactif = 'text-muted-foreground hover:text-foreground';
  return (
    <nav aria-label={t('scopeLabel')} className="inline-flex gap-1 rounded-xl bg-muted p-1">
      <Link
        href="/app/overview/agent"
        aria-current={agence ? undefined : 'page'}
        className={`${onglet} ${agence ? inactif : actif}`}
      >
        {t('scopeMine')}
      </Link>
      <Link
        href="/app/overview/agent?scope=agency"
        aria-current={agence ? 'page' : undefined}
        className={`${onglet} ${agence ? actif : inactif}`}
      >
        {t('scopeAgency')}
      </Link>
    </nav>
  );
}

function MetricLink({
  href,
  label,
  value,
  locale,
}: {
  readonly href: string;
  readonly label: string;
  readonly value: number;
  readonly locale: Locale;
}) {
  return (
    <Link
      href={href}
      className="mb-2 flex min-h-11 items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2 text-sm outline-none transition-colors last:mb-0 hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground tabular-nums">{formatNumber(value, locale)}</span>
    </Link>
  );
}

function EmptyWidgetState({ message }: { readonly message: string }) {
  return <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{message}</p>;
}

// TCK-595 (AC20 ter) — la langue de la requête et le fuseau `Africa/Dakar` de `@/lib/format`, plus
// un formateur figé en français qui suivait le fuseau de la machine. `dateStyle: undefined`
// retire le style par défaut du helper : `Intl` refuse un style mêlé à des champs.
function formatTime(value: string | null, locale: Locale, repli: string): string {
  if (!value) return repli;
  return formatDate(value, locale, { dateStyle: undefined, hour: '2-digit', minute: '2-digit' }) || repli;
}

function formatDateTime(value: string | null, locale: Locale, repli: string): string {
  if (!value) return repli;
  return formatDate(value, locale, {
    dateStyle: undefined,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }) || repli;
}
