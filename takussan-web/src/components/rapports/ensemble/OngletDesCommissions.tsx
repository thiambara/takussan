import { getTranslations } from 'next-intl/server';

import { BlocDeRapport, PeriodeDuRapport } from '@/components/rapports/vues/pieces';
import { localeDeLaRequete } from '@/i18n/locale-serveur';
import { formatCurrency } from '@/lib/format';
import { moisEnCoursDeLaReponse } from '@/lib/rapports/periode';
import { lireLeTableauDeLAgent } from '@/lib/rapports/tableau-de-l-agent';

import { DetailParBail } from './DetailParBail';
import { GraphiquesDuRapport } from './GraphiquesDuRapport';
import { BasculePortee } from './PiecesDeLAgent';
import { serieDe } from './series';

/**
 * TCK-2628 (L2) — l'onglet « Commissions » de l'agent : ce mois, le cumul de l'année, et les deux graphiques sur
 * 12 mois, une série chacun. TCK-2867 — « Détail par bail » (`DetailParBail`, le même que la vue d'ensemble), dont le
 * lien mène au relevé entier (la page Commissions, famille 6).
 */
export async function OngletDesCommissions({ scope }: { readonly scope?: string | string[] }) {
  const [t, tRapports, locale, { payload, peutVoirAgence, agence }] = await Promise.all([
    getTranslations('dashboard.agent'),
    getTranslations('rapports'),
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
      </BlocDeRapport>

      <DetailParBail agence={agence} lignes={20} lien={{ href: '/app/commissions', libelle: tRapports('detailParBail.toutLeReleve') }} />

      {ts ? (
        <GraphiquesDuRapport
          moisEnCours={moisEnCoursDeLaReponse(data.period)}
          series={[
            ...(commissions ? [{ id: 'commissions' as const, mois: ts.months, valeurs: commissions }] : []),
            ...(bauxSignes ? [{ id: 'bauxSignes' as const, mois: ts.months, valeurs: bauxSignes }] : []),
          ]}
        />
      ) : null}
    </div>
  );
}
