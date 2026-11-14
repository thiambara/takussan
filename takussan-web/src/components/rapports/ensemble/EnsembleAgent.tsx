import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { TuilesDuRapport } from '@/components/rapports/TuilesDuRapport';
import { BlocDeRapport, BlocVide, LienChiffre, PeriodeDuRapport, formatDateHeure } from '@/components/rapports/vues/pieces';
import { localeDeLaRequete } from '@/i18n/locale-serveur';
import { bornesLisibles } from '@/lib/rapports/periode';
import { hrefDeLOnglet } from '@/lib/navigation/rapports';
import { chiffresDeLAgent } from '@/lib/rapports/chiffres';
import { lireLeTableauDeLAgent } from '@/lib/rapports/tableau-de-l-agent';

import { GraphiquesDuRapport } from './GraphiquesDuRapport';
import { BasculePortee, BlocPipeline } from './PiecesDeLAgent';
import { serieDe } from './series';

/**
 * TCK-2628 (L2) — la vue d'ensemble de l'agent (maquette « Agent, portée « Moi » ») : la portée « Mes chiffres
 * / Agence » sous `reports.view_agency`, quatre chiffres (Commissions, Baux signés, Visites, Prospects), les
 * prospects par étape, puis « Commissions » et « Baux signés » sur 12 mois — DEUX graphiques, une série
 * chacun (l'ancien graphique les superposait sur un même axe).
 *
 * « Priorités » (demandes en attente, baux à signer, tâches du jour) et « Activité récente » RESTENT, sous les
 * graphiques, hors maquette : « Ma journée » (TCK-2596) ne porte ni ces trois comptes ni leurs liens filtrés
 * (TCK-1735, TCK-1513, TCK-1733), et la règle du ticket est qu'aucune fonction des vues remplacées ne se perd.
 * Les visites du jour et les tâches assignées, elles, vivent dans « Ma journée ». « Détail par bail » mène à
 * l'onglet Commissions, qui mène à la page Commissions (famille 6, hors périmètre).
 */
export async function EnsembleAgent({ scope }: { readonly scope?: string | string[] }) {
  const [t, tRapports, tEtapes, locale, { payload, peutVoirAgence, agence }] = await Promise.all([
    getTranslations('dashboard.agent'),
    getTranslations('rapports'),
    getTranslations('dashboard.pipelineStages'),
    localeDeLaRequete(),
    lireLeTableauDeLAgent(scope),
  ]);
  if (!payload) return <PeriodeDuRapport>{t('loadError')}</PeriodeDuRapport>;
  const data = payload.data;
  const ts = payload.timeseries;
  const moisEnCours = data.period.start.slice(0, 7);
  const commissions = serieDe(ts, 'commissions');
  const bauxSignes = serieDe(ts, 'signed_leases');
  const chiffres = chiffresDeLAgent(data, ts && bauxSignes ? { months: ts.months, signed_leases: bauxSignes.map((v) => v ?? 0) } : undefined, agence);
  const prospects = chiffres.find((c) => c.cle === 'prospects')?.valeur ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 md:justify-end">
        <PeriodeDuRapport periode>{tRapports('periode', bornesLisibles(data.period.start, data.period.end, locale))}</PeriodeDuRapport>
        {peutVoirAgence ? <BasculePortee agence={agence} t={t} /> : null}
      </div>

      <TuilesDuRapport chiffres={chiffres} />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
        <BlocPipeline
          pipeline={data.pipeline ?? {}}
          titre={t('pipelineChart')}
          total={tRapports('pipeline.prospects', { n: prospects })}
          vide={t('pipelineEmpty')}
          ouvrir={t('pipelineOpen')}
          nomDeLEtape={(e) => tEtapes(e)}
        />
        {ts ? (
          <GraphiquesDuRapport
            className="xl:grid-cols-1"
            moisEnCours={moisEnCours}
            series={[
              ...(commissions ? [{ id: 'commissions' as const, mois: ts.months, valeurs: commissions }] : []),
              ...(bauxSignes ? [{ id: 'bauxSignes' as const, mois: ts.months, valeurs: bauxSignes }] : []),
            ]}
          />
        ) : null}
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
        <BlocDeRapport title={t('pipelinePriorities')}>
          {/* TCK-1735 (P167.05) — sous « Mes chiffres », le nombre compte les réservations des biens de l'agent :
              le lien porte cette portée. Sous « Agence », la liste est celle de l'agence. */}
          <LienChiffre
            href={agence ? '/app/bookings' : '/app/bookings?only_mine=1'}
            label={t('pendingRequests')}
            value={data.pipeline_ops?.pending_bookings ?? data.bookings?.pending ?? 0}
            locale={locale}
          />
          {/* TCK-1513 (P167.03) — la liste ouverte sur le statut que le nombre compte. */}
          <LienChiffre href="/app/leases?status=pending_signature" label={t('leasesToSign')} value={data.pipeline_ops?.leases_to_sign ?? 0} locale={locale} />
          {/* TCK-1733 (P167.04) — les tâches assignées à l'agent dans l'agence active. */}
          <LienChiffre
            href="/app/tasks?filter[due]=today&filter[assigned_to]=me"
            label={t('tasksToday')}
            value={data.pipeline_ops?.tasks_today ?? data.tasks?.today ?? 0}
            locale={locale}
          />
        </BlocDeRapport>

        <BlocDeRapport title={t('recentActivity')}>
          {(data.recent_activity ?? []).length === 0 ? (
            <BlocVide message={t('noActivity')} />
          ) : (
            <ul className="space-y-3">
              {(data.recent_activity ?? []).map((activite) => (
                <li key={`${activite.type}-${activite.id}`} className="text-sm">
                  <p className="font-semibold text-pretty text-foreground">{activite.label}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{formatDateHeure(activite.at, locale, t('dateUnknown'))}</p>
                </li>
              ))}
            </ul>
          )}
        </BlocDeRapport>
      </div>

      <Link
        href={hrefDeLOnglet('commissions', agence ? 'agency' : null)}
        className="inline-flex min-h-11 items-center gap-0.5 rounded-sm text-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring"
      >
        {t('commissionsDetail')}
        <ChevronRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
