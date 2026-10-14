import { getMeAction } from '@/app/actions/auth';
import { AdminNotice, resoudreAvisAdmin } from '@/components/admin/AdminNotice';
import { AgencyActivityFeed } from '@/components/dashboard/admin/AgencyActivityFeed';
import { AgencyDegradedState } from '@/components/dashboard/admin/AgencyDegradedState';
import { AgencyKpis } from '@/components/dashboard/admin/AgencyKpis';
import { AgencyQueues } from '@/components/dashboard/admin/AgencyQueues';
import { AgencyRevenueSnapshot } from '@/components/dashboard/admin/AgencyRevenueSnapshot';
import { MiseEnService } from '@/components/dashboard/admin/MiseEnService';
import { PageHeader } from '@/components/console';
import { NoAgencyState } from '@/components/shared/NoAgencyState';
import { isSuperAdmin } from '@/lib/roles';
import { fetchDashboardAgency } from '@/lib/queries/dashboard-agency';
import { resolveAgencyOrNull } from '@/lib/access/server-guards';
import { garderPageAdmin } from '@/lib/access/pages-admin-server';
import { getToken } from '@/lib/session';
import { getTranslations } from 'next-intl/server';

/**
 * `searchParams` est ici pour UNE raison : `/admin` est l'écran d'arrivée des redirections de la
 * console, et une redirection qui a un motif doit le dire (TCK-370). Toute la lecture du
 * paramètre vit dans `AdminNotice` — un `notice` inconnu ne rend rien.
 */
export default async function Page({
  searchParams,
}: {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  // TCK-633 (lot B) — la garde d'abord : rôle, `kind` et capacités se jugent dans `PAGES_ADMIN`.
  await garderPageAdmin('/admin');
  const t = await getTranslations('admin.pages.home');
  const params = (await searchParams) ?? {};
  const avis = await resoudreAvisAdmin(params.notice);
  const user = await getMeAction();

  // TCK-115: super_admin without an agency context cannot scope the report.
  if (isSuperAdmin(user.roles) && !user.agency_id) {
    return <NoAgencyState title={t('noAgency')} />;
  }

  const agencyId = typeof user.agency_id === 'number' ? user.agency_id : null;

  // TCK-375 — le `kind` de l'agence, pour que les files sans objet en `individual` ne soient pas
  // rendues (contrainte métier du ticket).
  //
  // ⚠️ **Aucune requête supplémentaire** : `resolveAgencyOrNull` passe par `agenceDuRendu`, qui
  // est `cache()`é par React pour la durée du rendu — le layout vient de faire exactement le même
  // appel pour son cadenas, et celui-ci lit sa promesse.
  //
  // ⚠️ **Pour un `agency_admin`, il rend `true` sur cet écran, toujours.** `garderPageAdmin('/admin')`
  // ci-dessus renvoie l'admin d'une agence dont le `kind` n'est pas `standard` vers sa première page
  // accessible (TCK-633 ; avant, `ensureStandardAgencyOrRedirect` la renvoyait sur `/app`).
  // ⚠ **Le super-admin, lui, passe la garde quelle que soit son agence** (il passe l'agence et la
  // capacité, comme côté API — `pageAccessible`, écart E8 du lot B) : rattaché à une agence
  // `individual`, il ATTEINT la branche `individual` du bloc de files depuis cette page. C'est le
  // seul chemin vivant de cette branche, et c'est pourquoi le `kind` se LIT ici au lieu d'être
  // câblé en dur. *Une valeur constante aurait aussi supprimé la garde le jour où le redirect
  // bouge ; la lire la fait suivre.*
  let agencyIsStandard: boolean | undefined;
  if (agencyId !== null) {
    const token = await getToken();
    const agency = token
      ? await resolveAgencyOrNull(token, agencyId, 'admin/page (files d’attente)')
      : null;
    agencyIsStandard = agency ? agency.kind === 'standard' : undefined;
  }

  const payload = await fetchDashboardAgency({ withTimeseries: true });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
      />

      <AdminNotice avis={avis} />

      {/* TCK-589 — la mise en service en tête : elle disparaît une fois l'agence prête. */}
      <MiseEnService agencyId={agencyId} />

      {payload ? (
        <>
          {/* TCK-375 — les files AVANT les KPI : ce qui demande une action passe avant ce qui
              décrit un état. Les KPI restent, ils cessent d'occuper la première ligne. */}
          <AgencyQueues
            agencyId={agencyId}
            agencyIsStandard={agencyIsStandard}
            overdueCount={payload.data.finance.overdue_count}
          />
          <AgencyKpis summary={payload.data} />
          <div className="grid gap-6 lg:grid-cols-2">
            <AgencyActivityFeed summary={payload.data} />
            <AgencyRevenueSnapshot timeseries={payload.timeseries} />
          </div>
        </>
      ) : (
        <AgencyDegradedState />
      )}
    </div>
  );
}
