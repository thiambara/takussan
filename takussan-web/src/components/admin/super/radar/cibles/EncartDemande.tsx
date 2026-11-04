'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { History, Power, RefreshCw, TriangleAlert, UserRoundCheck } from 'lucide-react';

import { usePlatformAbilities } from '@/components/admin/super/PlatformAbilitiesProvider';
import { StatusBadge } from '@/components/console';
import { ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { WarningBanner } from '@/components/ui/warning-banner';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import type { ApiError } from '@/lib/api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import {
  fetchRadarDemand,
  radarKeys,
  RADAR_POLL_MS,
  refreshRadarDemand,
  setRadarDemandEnabled,
} from '@/lib/queries/radar';
import type { RadarDemandSetting, RadarDemandSettingResponse } from '@/types/radar';
import { BLOCAGES_DEMANDE_RADAR, ISSUES_DEMANDE_RADAR, MOTIFS_RADAR } from '../codes-radar';
import { codeDuRefus } from './useMessageRefusCible';

/** Combien de temps « rafraîchir maintenant » relit le réglage en attendant l'issue du passage (file `ai`, 85 s au plus). */
const ATTENTE_MAX_MS = 3 * 60_000;

export const CHEMIN_DES_REVISIONS = '/super-admin/radar/targets/revisions';

interface Attente {
  /** `last_run_at` au moment du lancement : l'issue est arrivée quand il change. */
  readonly depuis: string | null;
  readonly jusqua: number;
}

/**
 * TCK-2470 (ADR-0087 §6) — l'encart « Demande » de la page des cibles : les recherches restées sans résultat deviennent
 * des cibles, que l'IA révise chaque nuit. Le réglage est global (une ligne), d'où sa place sur la LISTE des cibles et
 * non sur la page d'une cible.
 *
 * Il dit : allumé ou éteint, l'opérateur au nom duquel l'IA est jugée, ce qui empêche un passage (`blocked_reason`), le
 * dernier passage et son issue, la dernière révision. Allumer fait de l'appelant l'opérateur, et l'écran le dit avant le
 * geste. Lecture `platform.radar.operate` ; allumer, éteindre, rafraîchir : `platform.radar.publish`.
 */
export function EncartDemande() {
  const t = useTranslations('superAdmin.pages.radar.targets.demand');
  const tRaisons = useTranslations('superAdmin.pages.radar.reasons');
  const tCommon = useTranslations('common');
  const { can } = usePlatformAbilities();
  const queryClient = useQueryClient();
  const messageErreur = useMessageErreurApi();
  const fmt = useFormatteurs();
  const lit = can('platform.radar.operate');
  const ecrit = can('platform.radar.publish');
  const [attente, setAttente] = useState<Attente | null>(null);

  const reglage = useQuery<RadarDemandSettingResponse, ApiError>({
    queryKey: radarKeys.demand(),
    queryFn: async () => {
      const precedent = queryClient.getQueryData<RadarDemandSettingResponse>(radarKeys.demand());
      const suivant = await fetchRadarDemand();
      // Un passage s'est terminé depuis la dernière lecture : les cibles ont pu changer.
      if (precedent && precedent.data.last_run_at !== suivant.data.last_run_at) {
        void queryClient.invalidateQueries({ queryKey: radarKeys.targets() });
      }
      return suivant;
    },
    enabled: lit,
    staleTime: 10_000,
    refetchInterval: (query) => (
      attente && query.state.data?.data.last_run_at === attente.depuis && Date.now() < attente.jusqua ? RADAR_POLL_MS : false
    ),
  });

  const poser = (reponse: RadarDemandSettingResponse) => queryClient.setQueryData(radarKeys.demand(), reponse);
  const basculer = useMutation<RadarDemandSettingResponse, ApiError, boolean>({
    mutationFn: setRadarDemandEnabled,
    onSuccess: (reponse) => {
      poser(reponse);
      setAttente(null);
    },
  });
  const rafraichir = useMutation<RadarDemandSettingResponse, ApiError, void>({
    mutationFn: refreshRadarDemand,
    onSuccess: (reponse) => {
      poser(reponse);
      setAttente({ depuis: reponse.data.last_run_at, jusqua: Date.now() + ATTENTE_MAX_MS });
    },
    // Un 409 dit que l'écran était en retard sur le réglage : on le relit.
    onError: () => void reglage.refetch(),
  });

  if (!lit) return null;

  if (reglage.isLoading) {
    return <Skeleton className="h-40 w-full rounded-xl" data-testid="radar-demande-chargement" />;
  }

  if (reglage.isError || !reglage.data) {
    return (
      <ErrorState
        message={messageErreur(reglage.error, t('loadError'))}
        onRetry={() => void reglage.refetch()}
        retryLabel={tCommon('actions.retry')}
      />
    );
  }

  const demande = reglage.data.data;
  const sansOperateur = demande.blocked_reason === 'radar.demand.operator_missing';
  const occupe = basculer.isPending || rafraichir.isPending;
  const erreur = basculer.error ?? rafraichir.error;
  const passageEnCours = attente !== null && demande.last_run_at === attente.depuis;

  const messageDuRefus = (e: ApiError) => {
    const code = codeDuRefus(e);
    return code && BLOCAGES_DEMANDE_RADAR[code] ? t(`blocked.${BLOCAGES_DEMANDE_RADAR[code]}`) : messageErreur(e, t('saveError'));
  };

  const issue = (code: string) => {
    if (ISSUES_DEMANDE_RADAR[code]) return t(`outcomes.${ISSUES_DEMANDE_RADAR[code]}`);
    if (code.startsWith('ai.') && MOTIFS_RADAR[code]) return tRaisons(MOTIFS_RADAR[code]);
    return t('outcomes.other');
  };

  const idAide = 'radar-demande-aide';

  return (
    <section
      aria-labelledby="radar-demande-titre"
      className="space-y-4 rounded-xl bg-card p-4 ring-1 ring-border"
      data-testid="radar-demande"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="radar-demande-titre" className="font-display text-base font-semibold text-balance text-foreground">
              {t('heading')}
            </h2>
            <StatusBadge
              tone={!demande.enabled ? 'neutral' : sansOperateur ? 'attention' : 'success'}
              label={demande.enabled ? t('enabled') : t('disabled')}
              data-testid="radar-demande-etat"
            />
          </div>
          <p className="text-xs text-muted-foreground" data-testid="radar-demande-operateur">
            <Operateur demande={demande} />
          </p>
        </div>
        {ecrit ? (
          <div className="flex flex-wrap items-center gap-2" data-testid="radar-demande-gestes">
            {demande.blocked_reason === null ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={occupe || passageEnCours}
                onClick={() => rafraichir.mutate()}
                data-testid="radar-demande-rafraichir"
              >
                <RefreshCw className={passageEnCours ? 'size-4 motion-safe:animate-spin' : 'size-4'} aria-hidden="true" />
                {t('refresh')}
              </Button>
            ) : null}
            {sansOperateur ? (
              <Button
                type="button"
                size="sm"
                disabled={occupe}
                onClick={() => basculer.mutate(true)}
                aria-describedby={idAide}
                data-testid="radar-demande-reprendre"
              >
                <UserRoundCheck className="size-4" aria-hidden="true" />
                {t('takeOver')}
              </Button>
            ) : null}
            <Button
              type="button"
              variant={demande.enabled ? 'ghost' : 'default'}
              size="sm"
              disabled={occupe}
              onClick={() => basculer.mutate(!demande.enabled)}
              aria-describedby={demande.enabled ? undefined : idAide}
              data-testid="radar-demande-bascule"
            >
              <Power className="size-4" aria-hidden="true" />
              {demande.enabled ? t('disable') : t('enable')}
            </Button>
          </div>
        ) : null}
      </div>

      <p className="max-w-prose text-sm text-pretty text-muted-foreground">
        {t('intro', { max: demande.max_demand })}
      </p>

      {sansOperateur ? (
        <WarningBanner icon={<TriangleAlert className="size-4" aria-hidden="true" />} data-testid="radar-demande-bloquee">
          {t('blocked.operatorMissing')}
        </WarningBanner>
      ) : null}
      {!demande.enabled ? (
        <p className="text-sm text-pretty text-foreground" data-testid="radar-demande-bloquee">{t('blocked.disabled')}</p>
      ) : null}
      {ecrit && (!demande.enabled || sansOperateur) ? (
        <p id={idAide} className="text-xs text-pretty text-muted-foreground" data-testid="radar-demande-aide">
          {sansOperateur ? t('takeOverHint') : t('enableHint')}
        </p>
      ) : null}
      {!ecrit ? <p className="text-xs text-muted-foreground">{t('readOnly')}</p> : null}

      <dl className="grid gap-3 border-t border-border pt-3 text-sm sm:grid-cols-2">
        <div className="min-w-0 space-y-0.5">
          <dt className="text-xs text-muted-foreground">{t('lastRun')}</dt>
          <dd className="text-foreground" data-testid="radar-demande-dernier-passage">
            {demande.last_run_at ? (
              <>
                <span className="tabular-nums">{fmt.dateTime(demande.last_run_at)}</span>
                {demande.last_run_outcome ? (
                  <span className="block text-xs text-pretty text-muted-foreground">{issue(demande.last_run_outcome)}</span>
                ) : null}
              </>
            ) : t('never')}
          </dd>
        </div>
        <div className="min-w-0 space-y-0.5">
          <dt className="text-xs text-muted-foreground">{t('lastRevision')}</dt>
          <dd className="text-foreground">
            <span className="tabular-nums">{demande.last_revision_at ? fmt.dateTime(demande.last_revision_at) : t('never')}</span>
            <Link
              href={CHEMIN_DES_REVISIONS}
              className="mt-0.5 flex w-fit items-center gap-1 rounded-sm text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              data-testid="radar-demande-historique"
            >
              <History className="size-3.5" aria-hidden="true" />
              {t('history')}
            </Link>
          </dd>
        </div>
      </dl>

      <div aria-live="polite" className="empty:hidden">
        {passageEnCours ? (
          <p className="text-xs text-muted-foreground" data-testid="radar-demande-lance">{t('refreshQueued')}</p>
        ) : null}
      </div>
      {erreur ? <ErrorState message={messageDuRefus(erreur)} data-testid="radar-demande-erreur" /> : null}
    </section>
  );
}

function Operateur({ demande }: { readonly demande: RadarDemandSetting }) {
  const t = useTranslations('superAdmin.pages.radar.targets.demand');
  const fmt = useFormatteurs();
  if (!demande.operator) return t('noOperator');
  return demande.enabled_at
    ? t('operatorSince', { name: demande.operator.name, date: fmt.date(demande.enabled_at) })
    : t('operator', { name: demande.operator.name });
}
