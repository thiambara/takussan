import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { BlocDeRapport, PeriodeDuRapport } from '@/components/rapports/vues/pieces';
import { localeDeLaRequete } from '@/i18n/locale-serveur';
import { formatCurrency } from '@/lib/format';
import { lireLeTableauDeLAgent } from '@/lib/rapports/tableau-de-l-agent';

import { GraphiquesDuRapport } from './GraphiquesDuRapport';
import { BasculePortee } from './PiecesDeLAgent';
import { serieDe } from './series';

/**
 * TCK-2628 (L2) — l'onglet « Commissions » de l'agent : ce mois, le cumul de l'année, « Détail par bail » (la
 * page Commissions, famille 6), et les deux graphiques sur 12 mois, une série chacun.
 */
export async function OngletDesCommissions({ scope }: { readonly scope?: string | string[] }) {
  const [t, locale, { payload, peutVoirAgence, agence }] = await Promise.all([
    getTranslations('dashboard.agent'),
    localeDeLaRequete(),
    lireLeTableauDeLAgent(scope),
  ]);
  if (!payload) return <PeriodeDuRapport>{t('loadError')}</PeriodeDuRapport>;
  const data = payload.data;
  const ts = payload.timeseries;
  const commissions = serieDe(ts, 'commissions');
  const bauxSignes = serieDe(ts, 'signed_leases');

  return (
    <div className="space-y-6">
      {peutVoirAgence ? <BasculePortee agence={agence} t={t} onglet="commissions" /> : null}

      <BlocDeRapport title={agence ? t('commissionsAgency') : t('commissions')}>
        <p className="text-2xl font-semibold text-foreground tabular-nums">{formatCurrency(data.finance?.commissions_month ?? 0, locale)}</p>
        <p className="text-sm text-muted-foreground">{t('thisMonth')}</p>
        <p className="mt-4 text-sm text-foreground">
          {t('yearToDate')} <span className="font-semibold tabular-nums">{formatCurrency(data.finance?.commissions_year ?? 0, locale)}</span>
        </p>
        <Link
          href="/app/commissions"
          className="mt-3 inline-flex min-h-11 items-center rounded-sm text-sm font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring"
        >
          {t('commissionsDetail')}
        </Link>
      </BlocDeRapport>

      {ts ? (
        <GraphiquesDuRapport
          moisEnCours={data.period.start.slice(0, 7)}
          series={[
            ...(commissions ? [{ id: 'commissions' as const, mois: ts.months, valeurs: commissions }] : []),
            ...(bauxSignes ? [{ id: 'bauxSignes' as const, mois: ts.months, valeurs: bauxSignes }] : []),
          ]}
        />
      ) : null}
    </div>
  );
}
