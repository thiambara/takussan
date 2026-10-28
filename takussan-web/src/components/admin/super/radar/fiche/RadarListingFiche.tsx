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
import { fetchRadarListing, radarKeys } from '@/lib/queries/radar';
import type { RadarListingDetail, RadarListingDetailResponse } from '@/types/radar';
import { FormulaireFiche } from './FormulaireFiche';
import { PanneauSource } from './PanneauSource';
import { useCorrectionsFiche } from './useCorrectionsFiche';

interface RadarListingFicheProps {
  readonly id: number;
}

/**
 * La fiche chargée : la source à gauche (colonne collante à partir de `lg`), les champs lus à droite.
 * Le passage cité par le champ survolé ou focalisé descend dans la source ; il vit ici, entre les deux.
 */
function FicheChargee({ detail }: { readonly detail: RadarListingDetail }) {
  const [passage, setPassage] = useState<string | null>(null);
  const corrections = useCorrectionsFiche(detail);

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start" data-testid="radar-fiche">
      <PanneauSource
        detail={detail}
        passage={passage}
        className="lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto"
      />
      <FormulaireFiche
        detail={detail}
        corrections={corrections}
        surPassage={setPassage}
      />
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
