import { getMeAction } from '@/app/actions/auth';
import { AdminNotice, resoudreAvisAdmin } from '@/components/admin/AdminNotice';
import { AgencyActivityFeed } from '@/components/dashboard/admin/AgencyActivityFeed';
import { AgencyDegradedState } from '@/components/dashboard/admin/AgencyDegradedState';
import { AgencyKpis } from '@/components/dashboard/admin/AgencyKpis';
import { AgencyQueues } from '@/components/dashboard/admin/AgencyQueues';
import { AgencyRevenueSnapshot } from '@/components/dashboard/admin/AgencyRevenueSnapshot';
import { PageHeader } from '@/components/console';
import { NoAgencyState } from '@/components/shared/NoAgencyState';
import { isSuperAdmin } from '@/lib/roles';
import { fetchDashboardAgency } from '@/lib/queries/dashboard-agency';
import { ensureStandardAgencyOrRedirect, resolveAgencyOrNull } from '@/lib/access/server-guards';
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
  const t = await getTranslations('admin.pages.home');
  const params = (await searchParams) ?? {};
  const avis = await resoudreAvisAdmin(params.notice);
  const user = await getMeAction();

  // TCK-115: super_admin without an agency context cannot scope the report.
  if (isSuperAdmin(user.roles) && !user.agency_id) {
    return <NoAgencyState title={t('noAgency')} />;
  }

  await ensureStandardAgencyOrRedirect(user);

  const agencyId = typeof user.agency_id === 'number' ? user.agency_id : null;

  // TCK-375 — le `kind` de l'agence, pour que les files sans objet en `individual` ne soient pas
  // rendues (contrainte métier du ticket).
  //
  // ⚠️ **Aucune requête supplémentaire** : `resolveAgencyOrNull` passe par `agenceDuRendu`, qui
  // est `cache()`é par React pour la durée du rendu — le layout vient de faire exactement le même
  // appel pour son cadenas, et celui-ci lit sa promesse.
  //
  // ⚠️ **Et il rend `true` sur cet écran, toujours.** Mesuré le 2026-08-27 : `/admin` figure dans
  // `PRO_ROUTES` et l'`ensureStandardAgencyOrRedirect` ci-dessus renvoie sur `/app` toute agence
  // dont le `kind` n'est pas `standard`. La branche `individual` du bloc de files est donc
  // INATTEIGNABLE DEPUIS CETTE PAGE aujourd'hui — elle est éprouvée au niveau du composant, et
  // c'est une garde en profondeur, pas un chemin vivant. *Câbler une valeur constante en dur
  // aurait supprimé la garde le jour où le redirect bouge ; la lire la fait suivre.*
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
