import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { TuilesDuRapport } from '@/components/rapports/TuilesDuRapport';
import { LienDesIndicateurs } from '@/components/rapports/vues/LienDesIndicateurs';
import { PeriodeDuRapport } from '@/components/rapports/vues/pieces';
import { buttonVariants } from '@/components/ui/button';
import { localeDeLaRequete } from '@/i18n/locale-serveur';
import { bornesLisibles } from '@/lib/rapports/periode';
import { fetchOwnerDashboard } from '@/lib/queries/dashboard';
import { chiffresDuBailleur } from '@/lib/rapports/chiffres';
import { isAdmin, isAgent } from '@/lib/roles';

import { GraphiquesDuRapport } from './GraphiquesDuRapport';
import { ProchainsReversements } from './ProchainsReversements';
import { serieDe } from './series';

/**
 * TCK-2628 (L2) — la vue d'ensemble du bailleur et de l'hôte (maquette « Bailleur ») : le portefeuille (loués,
 * libres, autres) et les chiffres — l'occupation AVEC sa base (AC4) —, « Encaissé » et « Occupation » sur
 * 12 mois (deux graphiques, une série chacun), les prochains reversements.
 *
 * « Demandes en attente » est sur l'accueil (`AFaireBailleur`, TCK-2624) ; l'« Attendu » superposé de la
 * maquette n'a pas de série mensuelle à l'API (écart de donnée, fiche de fidélité).
 */
export async function EnsembleBailleur() {
  const [t, tRapports, payload, { roles }, locale] = await Promise.all([
    getTranslations('dashboard.owner'),
    getTranslations('rapports'),
    fetchOwnerDashboard(),
    getMeAction(),
    localeDeLaRequete(),
  ]);
  if (!payload) return <PeriodeDuRapport>{t('loadError')}</PeriodeDuRapport>;
  const data = payload.data;
  const ts = payload.timeseries;
  // TCK-587 — le bailleur hors personnel PROPOSE un bien à son agence ; il ne l'ajoute pas au catalogue.
  const proposition = !isAgent(roles) && !isAdmin(roles);
  const cashflow = serieDe(ts, 'cashflow');
  const occupation = serieDe(ts, 'occupancy');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 md:justify-end">
        <PeriodeDuRapport periode>{tRapports('periode', bornesLisibles(data.period.start, data.period.end, locale))}</PeriodeDuRapport>
        {/* L'hôte ouvre les indicateurs (TCK-284) ; le bailleur, non : le lien se juge seul. */}
        <LienDesIndicateurs />
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

      <TuilesDuRapport chiffres={chiffresDuBailleur(data)} colonnes={5} />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_25rem]">
        {ts ? (
          <GraphiquesDuRapport
            className="xl:grid-cols-1"
            moisEnCours={data.period.start.slice(0, 7)}
            series={[
              ...(cashflow ? [{ id: 'cashflow' as const, mois: ts.months, valeurs: cashflow }] : []),
              ...(occupation ? [{ id: 'occupation' as const, mois: ts.months, valeurs: occupation }] : []),
            ]}
          />
        ) : null}
        {/* TCK-2801 (fiche TCK-2628, O5) — au téléphone, « Prochains reversements » suit les tuiles (maquette) ;
            au bureau, la colonne de droite. */}
        <div data-slot="bloc-reversements" className="max-xl:order-first">
          <ProchainsReversements />
        </div>
      </div>
    </div>
  );
}
