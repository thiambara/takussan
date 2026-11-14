import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { AgencyDegradedState } from '@/components/dashboard/admin/AgencyDegradedState';
import { MiseEnService } from '@/components/dashboard/admin/MiseEnService';
import { AmorceLectures } from '@/components/providers/AmorceLectures';
import { LienDesIndicateurs } from '@/components/rapports/vues/LienDesIndicateurs';
import { PeriodeDuRapport } from '@/components/rapports/vues/pieces';
import { TuilesDuRapport } from '@/components/rapports/TuilesDuRapport';
import { NoAgencyState } from '@/components/shared/NoAgencyState';
import { localeDeLaRequete } from '@/i18n/locale-serveur';
import { resolveAgencyOrNull } from '@/lib/access/server-guards';
import { formatDate } from '@/lib/format';
import { ongletOuvert } from '@/lib/navigation/rapports';
import { AGENCY_INVITATIONS_COUNT_KEY, fetchPendingInvitationsCount } from '@/lib/queries/agency-queues';
import { fetchDashboardAgency } from '@/lib/queries/dashboard-agency';
import type { LectureAmorcee } from '@/lib/queries/lectures-amorcees';
import { cleMiseEnService, fetchMiseEnService } from '@/lib/queries/mise-en-service';
import { chiffresDeLAgence, type ChiffreDuRapport } from '@/lib/rapports/chiffres';
import { lireLeContexteDesRapports } from '@/lib/rapports/contexte-serveur';
import { isSuperAdmin } from '@/lib/roles';
import { getToken } from '@/lib/session';

import { EquipeDuMois } from './EquipeDuMois';
import { GraphiquesDuRapport } from './GraphiquesDuRapport';

/**
 * TCK-2628 (L2) — la vue d'ensemble de l'admin d'agence (maquette `app-rapports`, « Vue d'ensemble (admin) ») :
 * les chiffres clés (les six, ou les KPI personnalisés de l'agence), chacun un lien ; « Encaissé » et
 * « Occupation » sur 12 mois, une série par graphique ; « Équipe ce mois » quand l'onglet Équipe est ouvert ;
 * « En chiffres », les quatre compteurs de l'ancienne « Activité récente », restés des liens.
 *
 * La carte « Mise en service » (`MiseEnService`, TCK-589) RESTE en tête, hors maquette : le bandeau d'une
 * ligne de l'accueil (`BandeauMiseEnService`, TCK-2622) renvoie ici pour la carte entière, et elle disparaît
 * d'elle-même une fois l'agence prête. Elle et le compte d'invitations sont lus côté serveur et amorcés
 * (TCK-1830), comme sur l'ancienne page. « À traiter » a quitté la page pour l'accueil (`AFaireAdmin`,
 * TCK-2624 : KYC, modération, invitations, impayés). Une lecture qui échoue rend l'état dégradé
 * (`AgencyDegradedState`), la carte de mise en service au-dessus, comme avant.
 */
export async function EnsembleAgence() {
  const [t, tActivite, user, contexte, locale] = await Promise.all([
    getTranslations('rapports'),
    getTranslations('dashboard.agencyActivity'),
    getMeAction(),
    lireLeContexteDesRapports(),
    localeDeLaRequete(),
  ]);

  // TCK-115 : un super-admin sans agence reçoit un 403 de `/api/dashboard/agency` — on ne le demande pas.
  if (isSuperAdmin(user.roles) && !user.agency_id) return <NoAgencyState title={t('titre')} />;
  const agencyId = typeof user.agency_id === 'number' ? user.agency_id : null;

  const token = agencyId !== null ? await getToken() : undefined;
  const agencyIsStandard = await lireLeKind(token, agencyId);
  // UNE lecture de l'endpoint par affichage (AC3 de TCK-647), séries comprises.
  const [payload, lectures] = await Promise.all([
    fetchDashboardAgency({ withTimeseries: true }),
    lecturesDePremierAffichage(token, agencyId, agencyIsStandard),
  ]);
  if (!payload) {
    return (
      <AmorceLectures lectures={lectures}>
        <div className="space-y-7">
          <MiseEnService agencyId={agencyId} />
          <AgencyDegradedState />
        </div>
      </AmorceLectures>
    );
  }

  const data = payload.data;
  const ts = payload.timeseries;
  const moisEnCours = data.period.start.slice(0, 7);
  const ouvertes = { impayes: ongletOuvert('impayes', contexte), equipe: ongletOuvert('equipe', contexte) };
  const chiffres = chiffresDeLAgence(data, ts ? { months: ts.months, revenue: ts.revenue } : undefined, { moisEnCours, ouvertes });

  const enChiffres: ChiffreDuRapport[] = [
    { cle: 'bookings', libelle: tActivite('items.bookings.label'), valeur: data.bookings.pending, forme: 'nombre', href: '/app/bookings' },
    { cle: 'maintenance', libelle: tActivite('items.maintenance.label'), valeur: data.maintenance.open, forme: 'nombre', href: '/app/maintenance' },
    { cle: 'customers', libelle: tActivite('items.customers.label'), valeur: data.customers_count, forme: 'nombre', href: '/app/customers' },
    {
      cle: 'team',
      libelle: tActivite('items.team.label'),
      valeur: data.members_count,
      forme: 'nombre',
      ...((contexte.cheminsAdmin ?? []).includes('/app/agency/team') ? { href: '/app/agency/team' } : {}),
    },
    // Repris des indices de l'ancienne tuile « Revenus du mois » et « Impayés » (`AgencyKpis`) : la commission de
    // l'agence sur le mois, et les pénalités de retard à recouvrer quand il y en a. Sans lien : aucune liste ne
    // les détaille pour l'admin (le grand livre des commissions est celui de l'agent, famille 6).
    { cle: 'commission', libelle: t('commissionsDuMois'), valeur: data.finance.commission_month, forme: 'montant' },
    ...((data.finance.late_fees_outstanding_amount ?? 0) > 0
      ? [{ cle: 'penalites', libelle: t('penalitesARecouvrer'), valeur: data.finance.late_fees_outstanding_amount ?? 0, forme: 'montant' as const }]
      : []),
  ];

  return (
    <AmorceLectures lectures={lectures}>
      <div className="space-y-7">
        <PeriodeDuRapport>{t('periode', { debut: formatDate(data.period.start, locale), fin: formatDate(data.period.end, locale) })}</PeriodeDuRapport>

        {/* TCK-589 — la mise en service en tête : elle disparaît une fois l'agence prête. */}
        <MiseEnService agencyId={agencyId} />

        <section aria-labelledby="rapports-chiffres-cles">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <h2 id="rapports-chiffres-cles" className="text-ui font-semibold text-muted-foreground">
              {t('chiffresCles')}
            </h2>
            <LienDesIndicateurs />
          </div>
          <TuilesDuRapport chiffres={chiffres} colonnes={6} visiblesAuTelephone={4} />
        </section>

        {ts ? (
          <GraphiquesDuRapport
            moisEnCours={moisEnCours}
            series={[
              { id: 'encaisse', mois: ts.months, valeurs: ts.revenue },
              { id: 'occupation', mois: ts.months, valeurs: ts.occupancy },
            ]}
          />
        ) : null}

        {ouvertes.equipe && agencyId !== null ? <EquipeDuMois agencyId={agencyId} periode={moisEnCours} agencyIsStandard={agencyIsStandard} /> : null}

        <section aria-labelledby="rapports-en-chiffres">
          <h2 id="rapports-en-chiffres" className="mb-2.5 text-corps font-semibold">
            {t('enChiffres')}
          </h2>
          <TuilesDuRapport chiffres={enChiffres} />
        </section>
      </div>
    </AmorceLectures>
  );
}

/** Le `kind` de l'agence, LU (`resolveAgencyOrNull` est `cache()`é : la garde vient de le lire). */
async function lireLeKind(token: string | null | undefined, agencyId: number | null): Promise<boolean | undefined> {
  if (agencyId === null) return undefined;
  const agence = token ? await resolveAgencyOrNull(token, agencyId, 'reports (ensemble)', 'decision') : null;
  return agence ? agence.kind === 'standard' : undefined;
}

/**
 * TCK-1830 (P136.05), repris de l'ancienne `/app/overview/agency` — la carte de mise en service et le compte
 * d'invitations (« Équipe ce mois »), lus ici et amorcés dans TanStack sous les clés de `MiseEnService` et de
 * `pendingInvitationsCountQueryOptions` : la carte est là au premier rendu. Une lecture en échec n'amorce rien,
 * le navigateur lit comme avant. Pas d'invitations pour une agence `individual`.
 */
async function lecturesDePremierAffichage(
  token: string | null | undefined,
  agencyId: number | null,
  agencyIsStandard: boolean | undefined,
): Promise<LectureAmorcee[]> {
  if (!token || agencyId === null) return [];
  const lectures: Array<[readonly unknown[], () => Promise<unknown>]> = [[cleMiseEnService(agencyId), () => fetchMiseEnService(token, agencyId)]];
  if (agencyIsStandard !== false) lectures.push([AGENCY_INVITATIONS_COUNT_KEY, () => fetchPendingInvitationsCount(token)]);
  const resultats = await Promise.allSettled(lectures.map(([, lire]) => lire()));
  const lueA = Date.now();
  return resultats.flatMap((r, i) => (r.status === 'fulfilled' ? [{ cle: [...lectures[i]![0]], donnee: r.value, lueA }] : []));
}
