import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { AFaireBailleur, type FilesDeLHote } from '@/components/accueil/bailleur/AFaireBailleur';
import { ChoixDeLaPeriode } from '@/components/rapports/ChoixDeLaPeriode';
import { TuilesDuRapport } from '@/components/rapports/TuilesDuRapport';
import { LienDesIndicateurs } from '@/components/rapports/vues/LienDesIndicateurs';
import { PeriodeDuRapport } from '@/components/rapports/vues/pieces';
import { buttonVariants } from '@/components/ui/button';
import { localeDeLaRequete } from '@/i18n/locale-serveur';
import { bornesLisibles, moisEnCoursDeLaReponse, periodeALire, type PeriodeDesRapports } from '@/lib/rapports/periode';
import { fetchOwnerDashboard } from '@/lib/queries/dashboard';
import { chiffresDuBailleur, etatsDuJourAMarquer } from '@/lib/rapports/chiffres';
import { lireLeContexteDesRapports } from '@/lib/rapports/contexte-serveur';
import { isAdmin, isAgent } from '@/lib/roles';

import { GraphiquesDuRapport } from './GraphiquesDuRapport';
import { ProchainsReversements } from './ProchainsReversements';
import { serieDe } from './series';

/**
 * TCK-2628 (L2) — la vue d'ensemble du bailleur et de l'hôte (maquette « Bailleur ») : le portefeuille (loués,
 * libres, autres) et les chiffres — l'occupation AVEC sa base (AC4) —, « Encaissé » et « Occupation » sur
 * 12 mois (deux graphiques, une série chacun), les prochains reversements.
 *
 * TCK-2867 (maquette e8) — « Demandes en attente » : LE bloc de l'accueil (`AFaireBailleur`, TCK-2624), mêmes
 * lectures et mêmes gestes, sous ce titre — il reste aussi sur l'accueil ; au bureau dans la colonne de droite sous
 * les reversements, au téléphone après le graphique. L'encaissé porte l'« Attendu » (`timeseries.expected`,
 * TCK-2865) en repères, avec sa légende. Sous « 12 mois », « sur … attendus » est l'attendu des douze mois.
 */
export async function EnsembleBailleur({ periode = 'current_month' }: { readonly periode?: PeriodeDesRapports } = {}) {
  const [t, tRapports, payload, { roles, id: userId }, locale, { persona }] = await Promise.all([
    getTranslations('dashboard.owner'),
    getTranslations('rapports'),
    fetchOwnerDashboard(periodeALire(periode)),
    getMeAction(),
    localeDeLaRequete(),
    lireLeContexteDesRapports(),
  ]);
  if (!payload) return <PeriodeDuRapport>{t('loadError')}</PeriodeDuRapport>;
  const data = payload.data;
  const ts = payload.timeseries;
  // TCK-587 — le bailleur hors personnel PROPOSE un bien à son agence ; il ne l'ajoute pas au catalogue.
  const proposition = !isAgent(roles) && !isAdmin(roles);
  const cashflow = serieDe(ts, 'cashflow');
  const occupation = serieDe(ts, 'occupancy');
  const attendu = serieDe(ts, 'expected');
  // TCK-2867 — sous « 12 mois », l'encaissé est celui des douze mois : il se lit sur l'attendu des mêmes mois.
  const attenduDeLaPeriode =
    data.period.key === 'last_12_months' ? (attendu ? attendu.reduce<number>((s, v) => s + (v ?? 0), 0) : null) : undefined;
  // Les deux files de l'hôte, lues comme l'accueil les lit (`lireLesFilesDeLHote`) : de ce même tableau de bord.
  const hote: FilesDeLHote | null =
    persona === 'hote' ? { reservations: { etat: 'pret', total: data.bookings?.pending ?? 0 }, avis: { etat: 'pret', total: data.reviews?.unanswered ?? 0 } } : null;

  return (
    <div className="space-y-6">
      <div>
        <ChoixDeLaPeriode variante="puces" />
        <div className="flex flex-wrap items-center justify-between gap-3 md:justify-end">
          <PeriodeDuRapport periode>{tRapports('periode', bornesLisibles(data.period.start, data.period.end, locale))}</PeriodeDuRapport>
          {/* L'hôte ouvre les indicateurs (TCK-284) ; le bailleur, non : le lien se juge seul. */}
          <LienDesIndicateurs />
        </div>
      </div>

      {(data.portfolio?.total ?? 0) === 0 ? (
        <section className="rounded-xl border border-dashed border-border bg-card p-6">
          <h2 className="text-base font-semibold text-foreground">{t('emptyTitle')}</h2>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">{proposition ? t('proposalEmptyBody') : t('emptyBodyFull')}</p>
          <Link href="/app/properties/new" className={buttonVariants({ className: 'mt-4' })}>
            {proposition ? t('proposalEmptyCta') : t('emptyCta')}
          </Link>
        </section>
      ) : null}

      <TuilesDuRapport
        chiffres={chiffresDuBailleur(data, { etatsDuJour: etatsDuJourAMarquer(data.period), ...(attenduDeLaPeriode !== undefined ? { attenduDeLaPeriode } : {}) })}
        colonnes={5}
      />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_25rem]">
        {ts ? (
          <GraphiquesDuRapport
            className="xl:grid-cols-1"
            moisEnCours={moisEnCoursDeLaReponse(data.period)}
            series={[
              ...(cashflow ? [{ id: 'cashflow' as const, mois: ts.months, valeurs: cashflow, ...(attendu ? { attendu } : {}) }] : []),
              ...(occupation ? [{ id: 'occupation' as const, mois: ts.months, valeurs: occupation }] : []),
            ]}
          />
        ) : null}
        {/* TCK-2801 (fiche TCK-2628, O5) — au téléphone, « Prochains reversements » suit les tuiles (maquette) ;
            au bureau, la colonne de droite. */}
        <div className="contents xl:block xl:space-y-5">
          <div data-slot="bloc-reversements" className="max-xl:order-first">
            <ProchainsReversements />
          </div>
          {/* Au téléphone, les cartes du bloc vont bord à bord comme sur l'accueil (son `px-4` les remet en place). */}
          <div data-slot="demandes-en-attente" className="max-md:-mx-4">
            <AFaireBailleur landlordId={userId} hote={hote} titre={tRapports('demandesEnAttente')} />
          </div>
        </div>
      </div>
    </div>
  );
}
