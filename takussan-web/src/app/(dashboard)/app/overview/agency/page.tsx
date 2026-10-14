import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { AdminNotice, resoudreAvisAdmin } from '@/components/admin/AdminNotice';
import { LineChart } from '@/components/charts/LineChart';
import { PageHeader } from '@/components/console';
import { AgencyActivityFeed } from '@/components/dashboard/admin/AgencyActivityFeed';
import { AgencyDegradedState } from '@/components/dashboard/admin/AgencyDegradedState';
import { AgencyKpis } from '@/components/dashboard/admin/AgencyKpis';
import { AgencyQueues } from '@/components/dashboard/admin/AgencyQueues';
import { AgencyRevenueSnapshot } from '@/components/dashboard/admin/AgencyRevenueSnapshot';
import { MiseEnService } from '@/components/dashboard/admin/MiseEnService';
import { NoAgencyState } from '@/components/shared/NoAgencyState';
import { localeDeLaRequete } from '@/i18n/locale-serveur';
import { resolveAgencyOrNull } from '@/lib/access/server-guards';
import { formatDate } from '@/lib/format';
import { fetchDashboardAgency } from '@/lib/queries/dashboard-agency';
import { isSuperAdmin } from '@/lib/roles';
import { getToken } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.overviewAgency');
  return { title: t('metaTitle') };
}

/**
 * Le tableau de bord d'agence — LE seul (TCK-647, ADR-0064 §3).
 *
 * Il a absorbé celui de `/admin`, qui lisait le même `GET /api/dashboard/agency` pour la même
 * audience : sa structure (mise en service, files, indicateurs, activité, revenus) plus ce que
 * celui-ci montrait seul (la courbe d'occupation, la commission du mois). **Un chiffre n'y
 * figure qu'une fois** : le nombre d'impayés vit dans la file qui y mène, pas en indice de la
 * tuile des montants ; revenus et occupation ont chacun leur graphique au lieu d'un axe partagé
 * entre des F CFA et des pourcentages.
 *
 * La garde de rôle et de `kind` est dans `layout.tsx` (TCK-426) — elle n'a pas bougé.
 *
 * `searchParams` sert une seule chose : l'écran d'arrivée d'une redirection qui a un motif doit
 * le dire (TCK-370, `AdminNotice`). Un `notice` inconnu ne rend rien.
 */
export default async function AgencyDashboardPage({
  searchParams,
}: {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations('dashboard.agency');
  const user = await getMeAction();

  // TCK-115 : un super-admin sans agence reçoit un 403 de `/api/dashboard/agency` — on ne le
  // demande pas.
  if (isSuperAdmin(user.roles) && !user.agency_id) {
    return <NoAgencyState title={t('title')} />;
  }

  const agencyId = typeof user.agency_id === 'number' ? user.agency_id : null;

  // Le `kind` est LU, pas supposé — et sans requête de plus : `resolveAgencyOrNull` est `cache()`é
  // pour le rendu, et le layout vient de faire le même appel.
  //
  // ⚠ Il vaut `standard` à chaque rendu qui arrive ici : le layout renvoie vers `/app` toute agence
  // qui ne l'est pas, ou dont le `kind` est illisible — super-admin compris, à la différence de
  // l'ancienne garde de `/admin` (`agency/__tests__/layout.garde.test.tsx`). La branche
  // `individual` d'`AgencyQueues` n'est donc plus atteinte depuis cette page ; elle reste au
  // composant comme défense en profondeur. Le lire plutôt que câbler `true` fait suivre la file
  // le jour où la garde bouge.
  let agencyIsStandard: boolean | undefined;
  if (agencyId !== null) {
    const token = await getToken();
    const agency = token ? await resolveAgencyOrNull(token, agencyId, 'overview/agency (files)') : null;
    agencyIsStandard = agency ? agency.kind === 'standard' : undefined;
  }

  // UNE lecture de l'endpoint par affichage (AC3), séries temporelles comprises : 403/404 rendent
  // `null`, donc l'état dégradé plutôt qu'une exception.
  const [payload, locale, avis] = await Promise.all([
    fetchDashboardAgency({ withTimeseries: true }),
    localeDeLaRequete(),
    searchParams?.then((params) => resoudreAvisAdmin(params.notice)) ?? null,
  ]);
  const ts = payload?.timeseries;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={
          payload
            ? t('period', {
                start: formatDate(payload.data.period.start, locale),
                end: formatDate(payload.data.period.end, locale),
              })
            : undefined
        }
      />

      <AdminNotice avis={avis} />

      {/* TCK-589 — la mise en service en tête : elle disparaît une fois l'agence prête. */}
      <MiseEnService agencyId={agencyId} />

      {payload ? (
        <>
          {/* TCK-375 — les files AVANT les indicateurs : ce qui demande un geste passe avant ce
              qui décrit un état. */}
          <AgencyQueues
            agencyId={agencyId}
            agencyIsStandard={agencyIsStandard}
            overdueCount={payload.data.finance.overdue_count}
          />
          <AgencyKpis summary={payload.data} />
          <div className="grid gap-6 lg:grid-cols-2">
            <AgencyActivityFeed summary={payload.data} />
            <AgencyRevenueSnapshot timeseries={ts} />
          </div>
          <section aria-labelledby="agency-occupancy-heading" className="rounded-2xl bg-card p-6">
            <h2 id="agency-occupancy-heading" className="mb-4 text-sm font-semibold text-foreground">
              {t('occupancyHeading')}
            </h2>
            <LineChart
              unit="%"
              abscisses="mois"
              className="h-64"
              data={{
                labels: ts?.months ?? [],
                series: [{ name: t('chartOccupancy'), values: ts?.occupancy ?? [], color: 'stroke-chart-2' }],
              }}
            />
          </section>
        </>
      ) : (
        <AgencyDegradedState />
      )}
    </div>
  );
}
