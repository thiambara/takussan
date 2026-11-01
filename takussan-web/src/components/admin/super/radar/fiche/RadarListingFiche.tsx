'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { usePlatformAbilities } from '@/components/admin/super/PlatformAbilitiesProvider';
import { PageHeader, StatusBadge } from '@/components/console';
import { ErrorState } from '@/components/feedback';
import { Skeleton } from '@/components/ui/skeleton';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import type { ApiError } from '@/lib/api';
import { fetchRadarListing, fetchRadarMatches, RADAR_POLL_MS, radarKeys } from '@/lib/queries/radar';
import type { RadarListingDetail, RadarListingDetailResponse, RadarMatch, RadarMatchesResponse } from '@/types/radar';
import { BarreDesGestes } from './BarreDesGestes';
import { DialogueDoublon, DialogueEcart } from './DialoguesFiche';
import { FormulaireFiche } from './FormulaireFiche';
import { PanneauProvenances } from './PanneauProvenances';
import { PanneauSource } from './PanneauSource';
import type { SurPassage } from './passage';
import { RadarMatchesPanel } from './RadarMatchesPanel';
import { useCorrectionsFiche } from './useCorrectionsFiche';
import { useGestesFiche } from './useGestesFiche';
import { useRaccourcisFiche } from './useRaccourcisFiche';

interface RadarListingFicheProps {
  readonly id: number;
}

type Dialogue =
  | { readonly type: 'duplicate'; readonly prefill: RadarMatch | null }
  | { readonly type: 'discard' };

/**
 * La fiche chargée : la source à gauche (colonne collante à partir de `lg`), à droite les rapprochements
 * puis les champs lus. Le passage cité par le champ survolé ou focalisé descend dans la source ; il vit
 * ici, entre les deux. Les trois gestes (valider, doublon, écarter), leurs raccourcis et leurs dialogues
 * aussi : chacun envoie d'abord les corrections en attente.
 */
function FicheChargee({ detail }: { readonly detail: RadarListingDetail }) {
  const tFiche = useTranslations('superAdmin.pages.radar.listing');
  const [survol, setSurvol] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const passage = survol ?? focus;
  const surPassage: SurPassage = (cite, origine) => (origine === 'survol' ? setSurvol(cite) : setFocus(cite));
  const [dialogue, setDialogue] = useState<Dialogue | null>(null);
  const corrections = useCorrectionsFiche(detail);
  const gestes = useGestesFiche(detail, corrections);

  const rapprochements = useQuery<RadarMatchesResponse, ApiError>({
    queryKey: radarKeys.matches(detail.id),
    queryFn: () => fetchRadarMatches(detail.id),
    staleTime: 10_000,
    refetchInterval: (query) => (query.state.data?.data.photos.status === 'pending' ? RADAR_POLL_MS : false),
  });
  const matches = rapprochements.data?.data.matches ?? [];

  const ouvrir = (suivant: Dialogue) => {
    if (gestes.enCours) return;
    gestes.effacerErreur();
    corrections.effacerErreur();
    setDialogue(suivant);
  };
  const ouvrirDoublon = (prefill: RadarMatch | null = null) => {
    if (gestes.peutFermer) ouvrir({ type: 'duplicate', prefill });
  };
  const ouvrirEcart = () => {
    if (gestes.peutFermer) ouvrir({ type: 'discard' });
  };
  const fermer = () => {
    gestes.effacerErreur();
    corrections.effacerErreur();
    setDialogue(null);
  };

  useRaccourcisFiche({ valider: () => void gestes.valider(), doublon: () => ouvrirDoublon(), ecarter: ouvrirEcart });

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start" data-testid="radar-fiche">
      <PanneauSource
        detail={detail}
        passage={passage}
        className="lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto"
      />
      <div className="space-y-6">
        <PanneauProvenances detail={detail} />
        <RadarMatchesPanel
          matches={rapprochements.data?.data}
          chargement={rapprochements.isLoading}
          erreur={rapprochements.isError}
          onDoublon={(match) => ouvrirDoublon(match)}
          desactive={!gestes.peutFermer || gestes.enCours}
        />
        <FormulaireFiche
          detail={detail}
          corrections={corrections}
          surPassage={surPassage}
          erreurGeste={dialogue ? undefined : gestes.erreur}
          avertissementGeste={!dialogue && gestes.nouveauxRapprochements ? tFiche('errors.newMatches') : undefined}
          gestes={(
            <BarreDesGestes
              gestes={gestes}
              stoppee={detail.stage === 'do_not_contact'}
              onDoublon={() => ouvrirDoublon()}
              onEcarter={ouvrirEcart}
            />
          )}
        />
      </div>

      {dialogue?.type === 'duplicate' ? (
        <DialogueDoublon
          open
          onOpenChange={(ouvert) => { if (!ouvert) fermer(); }}
          matches={matches}
          prefill={dialogue.prefill}
          pending={gestes.enCours}
          erreur={corrections.erreur ?? gestes.erreur}
          onConfirm={(cible) => void gestes.lancer({ type: 'duplicate', cible })}
        />
      ) : null}
      {dialogue?.type === 'discard' ? (
        <DialogueEcart
          open
          onOpenChange={(ouvert) => { if (!ouvert) fermer(); }}
          pending={gestes.enCours}
          erreur={corrections.erreur ?? gestes.erreur}
          onConfirm={(motif) => void gestes.lancer({ type: 'discard', motif })}
        />
      ) : null}
    </div>
  );
}

/**
 * TCK-2387 (ADR-0077) — la fiche d'une annonce du Radar : la source et ce qu'on en a lu, côte à côte,
 * pour relire, corriger, puis (tâche suivante) valider ou écarter. Geste `platform.radar.operate`.
 */
export function RadarListingFiche({ id }: RadarListingFicheProps) {
  const t = useTranslations('superAdmin.pages.radar.listing');
  const tRadar = useTranslations('superAdmin.pages.radar');
  const tCommon = useTranslations('common');
  const { can } = usePlatformAbilities();
  const messageErreur = useMessageErreurApi();
  const autorise = can('platform.radar.operate');

  const fiche = useQuery<RadarListingDetailResponse, ApiError>({
    queryKey: radarKeys.detail(id),
    queryFn: () => fetchRadarListing(id),
    enabled: autorise,
    staleTime: 10_000,
  });

  const retour = (
    <Link
      href="/super-admin/radar"
      className="inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {t('back')}
    </Link>
  );

  // Un viewer qui tape l'URL : un seul refus, aucun appel (l'API rendrait un 403).
  if (!autorise) {
    return (
      <div className="space-y-6">
        {retour}
        <PageHeader title={t('title', { id })} />
        <ErrorState message={t('forbidden')} />
      </div>
    );
  }

  const detail = fiche.data?.data;

  return (
    <div className="space-y-6">
      {retour}
      <PageHeader
        title={detail?.extracted?.title?.value || t('title', { id })}
        description={detail ? <StatusBadge tone="neutral" label={tRadar(`stages.${detail.stage}`)} /> : undefined}
      />
      {fiche.isError ? (
        <ErrorState
          message={`${t('loadError')} ${messageErreur(fiche.error)}`}
          onRetry={() => void fiche.refetch()}
          retryLabel={tCommon('actions.retry')}
        />
      ) : detail ? (
        <FicheChargee key={detail.id} detail={detail} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2" aria-busy="true">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      )}
    </div>
  );
}
