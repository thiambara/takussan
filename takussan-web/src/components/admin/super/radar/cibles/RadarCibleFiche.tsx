'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Archive, Inbox, Pause, Pencil, Pin, PinOff, Play } from 'lucide-react';

import { usePlatformAbilities } from '@/components/admin/super/PlatformAbilitiesProvider';
import { DataState, PageHeader, StatusBadge } from '@/components/console';
import { Pagination } from '@/components/console/Pagination';
import { EmptyState, ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import type { ApiError } from '@/lib/api';
import { useFormatteurs, VALEUR_ABSENTE } from '@/lib/format/useFormatteurs';
import {
  fetchRadarTarget,
  fetchRadarTargetListings,
  radarKeys,
  retireRadarTarget,
  updateRadarTarget,
} from '@/lib/queries/radar';
import type { PaginatedResponse } from '@/types/api';
import type { RadarTarget, RadarTargetChanges, RadarTargetListingRow, RadarTargetResponse } from '@/types/radar';
import { RadarNav } from '../RadarNav';
import { CarteAnnonceTrouvee } from './CarteAnnonceTrouvee';
import { morceauxDuResume, SEPARATEUR_DU_RESUME } from './criteres';
import { PanneauCible } from './PanneauCible';
import { TON_DE_LA_CIBLE } from './tons';
import { useMessageRefusCible } from './useMessageRefusCible';

const PAR_PAGE = 24;

function Chiffre({ libelle, valeur, testId }: { readonly libelle: string; readonly valeur: string; readonly testId?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{libelle}</dt>
      <dd className="font-display text-lg font-semibold text-foreground tabular-nums" data-testid={testId}>{valeur}</dd>
    </div>
  );
}

interface GestesProps {
  readonly cible: RadarTarget;
}

/**
 * Les gestes d'écriture (`platform.radar.publish`) : régler, mettre en pause ou reprendre, épingler une cible de la
 * demande, retirer. Une cible retirée n'en porte aucun.
 */
function GestesDeLaCible({ cible }: GestesProps) {
  const t = useTranslations('superAdmin.pages.radar.targets');
  const queryClient = useQueryClient();
  const messageRefus = useMessageRefusCible();
  const [reglage, setReglage] = useState(false);
  const [retrait, setRetrait] = useState(false);

  const poser = (reponse: RadarTargetResponse) => {
    queryClient.setQueryData(radarKeys.target(cible.id), reponse);
    void queryClient.invalidateQueries({ queryKey: radarKeys.targetLists() });
  };
  const modifier = useMutation<RadarTargetResponse, ApiError, RadarTargetChanges>({
    mutationFn: (changes) => updateRadarTarget(cible.id, changes),
    onSuccess: poser,
  });
  const retirer = useMutation<RadarTargetResponse, ApiError, void>({
    mutationFn: () => retireRadarTarget(cible.id),
    onSuccess: (reponse) => {
      poser(reponse);
      setRetrait(false);
    },
  });
  const occupe = modifier.isPending || retirer.isPending;
  const erreur = modifier.error ?? (retrait ? null : retirer.error);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2" data-testid="radar-cible-gestes">
        <Button type="button" onClick={() => setReglage(true)} disabled={occupe} data-testid="radar-cible-regler">
          <Pencil className="size-4" aria-hidden="true" />
          {t('actions.edit')}
        </Button>
        {cible.status === 'active' ? (
          <Button type="button" variant="outline" disabled={occupe} onClick={() => modifier.mutate({ status: 'paused' })} data-testid="radar-cible-pause">
            <Pause className="size-4" aria-hidden="true" />
            {t('actions.pause')}
          </Button>
        ) : (
          <Button type="button" variant="outline" disabled={occupe} onClick={() => modifier.mutate({ status: 'active' })} data-testid="radar-cible-reprendre">
            <Play className="size-4" aria-hidden="true" />
            {t('actions.resume')}
          </Button>
        )}
        {cible.origin === 'demand' ? (
          <Button type="button" variant="outline" disabled={occupe} onClick={() => modifier.mutate({ pinned: !cible.pinned })} data-testid="radar-cible-epingler">
            {cible.pinned ? <PinOff className="size-4" aria-hidden="true" /> : <Pin className="size-4" aria-hidden="true" />}
            {cible.pinned ? t('actions.unpin') : t('actions.pin')}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" disabled={occupe} onClick={() => setRetrait(true)} data-testid="radar-cible-retirer">
          <Archive className="size-4" aria-hidden="true" />
          {t('actions.retire')}
        </Button>
      </div>
      {erreur ? <ErrorState message={messageRefus(erreur)} /> : null}

      <PanneauCible open={reglage} onOpenChange={setReglage} cible={cible} />

      <Dialog open={retrait} onOpenChange={(ouvert) => { if (!ouvert && !retirer.isPending) setRetrait(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('retire.title', { name: cible.name })}</DialogTitle>
            <DialogDescription>{t('retire.body')}</DialogDescription>
          </DialogHeader>
          {retirer.error ? <ErrorState message={messageRefus(retirer.error)} /> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRetrait(false)} disabled={retirer.isPending}>
              {t('retire.cancel')}
            </Button>
            <Button type="button" variant="destructive" onClick={() => retirer.mutate()} disabled={retirer.isPending} data-testid="radar-cible-retirer-confirmer">
              {t('retire.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * TCK-2469 (ADR-0087 §5) — la page d'une cible : ses critères en clair, ce qu'elle a rapporté, et ses annonces en cartes
 * compactes, paginées, chacune menant à sa fiche. Lecture `platform.radar.operate` ; les gestes, `platform.radar.publish`.
 *
 * TCK-2470 y ajoutera l'encart « Demande » d'une cible tirée des recherches (ses révisions) : il se pose sous l'en-tête,
 * avant les annonces.
 */
export function RadarCibleFiche({ id }: { readonly id: number }) {
  const t = useTranslations('superAdmin.pages.radar.targets');
  const tRadar = useTranslations('superAdmin.pages.radar');
  const tTypes = useTranslations('property.types');
  const tSites = useTranslations('superAdmin.pages.radar.sites');
  const tCommon = useTranslations('common');
  const { can } = usePlatformAbilities();
  const messageErreur = useMessageErreurApi();
  const fmt = useFormatteurs();
  const [page, setPage] = useState(1);
  const lit = can('platform.radar.operate');
  const ecrit = can('platform.radar.publish');

  const fiche = useQuery<RadarTargetResponse, ApiError>({
    queryKey: radarKeys.target(id),
    queryFn: () => fetchRadarTarget(id),
    enabled: lit,
    staleTime: 10_000,
  });
  const annonces = useQuery<PaginatedResponse<RadarTargetListingRow>, ApiError>({
    queryKey: radarKeys.targetListings(id, page),
    queryFn: () => fetchRadarTargetListings(id, page, PAR_PAGE),
    enabled: lit,
    staleTime: 10_000,
  });

  const retour = (
    <Link
      href="/super-admin/radar/targets"
      className="inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {t('back')}
    </Link>
  );

  if (!lit) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('title')} />
        <ErrorState message={tRadar('forbidden')} />
      </div>
    );
  }

  if (fiche.isLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <RadarNav />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (fiche.isError || !fiche.data) {
    return (
      <div className="space-y-6">
        <RadarNav />
        {retour}
        {fiche.error?.status === 404 ? (
          <ErrorState message={t('notFound')} />
        ) : (
          <ErrorState
            message={messageErreur(fiche.error, t('loadError'))}
            onRetry={() => void fiche.refetch()}
            retryLabel={tCommon('actions.retry')}
          />
        )}
      </div>
    );
  }

  const cible = fiche.data.data;
  const resume = morceauxDuResume(cible.criteria, { t, tTypes, tSites, fmt });

  return (
    <div className="space-y-6">
      <RadarNav />
      {retour}
      <PageHeader
        eyebrow={t(`origin.${cible.origin}`)}
        title={(
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            {cible.name}
            <StatusBadge tone={TON_DE_LA_CIBLE[cible.status]} label={t(`status.${cible.status}`)} data-testid="radar-cible-statut" />
            {cible.pinned ? (
              <StatusBadge tone="info" icon={<Pin className="size-3" aria-hidden="true" />} label={t('pinned')} data-testid="radar-cible-badge-epinglee" />
            ) : null}
          </span>
        )}
        description={<span data-testid="radar-cible-resume">{resume.join(SEPARATEUR_DU_RESUME) || VALEUR_ABSENTE}</span>}
      />

      {ecrit && cible.status !== 'retired' ? <GestesDeLaCible cible={cible} /> : null}
      {cible.status === 'retired' ? (
        <p className="text-sm text-muted-foreground" data-testid="radar-cible-retiree">{t('retiredNote')}</p>
      ) : null}

      <dl className="grid grid-cols-2 gap-4 rounded-xl bg-card p-4 ring-1 ring-border sm:grid-cols-3 lg:grid-cols-4">
        <Chiffre libelle={t('stats.matches')} valeur={fmt.nombre(cible.matches_count)} testId="radar-cible-trouvees" />
        <Chiffre libelle={t('stats.lastMatch')} valeur={cible.last_matched_at ? fmt.dateTime(cible.last_matched_at) : VALEUR_ABSENTE} />
        <Chiffre libelle={t('stats.created')} valeur={fmt.date(cible.created_at)} />
        {cible.origin === 'demand' ? (
          <Chiffre libelle={t('stats.demand')} valeur={cible.demand_count === null ? VALEUR_ABSENTE : fmt.nombre(cible.demand_count)} />
        ) : null}
      </dl>

      <section aria-labelledby="radar-cible-annonces" className="space-y-3">
        <h2 id="radar-cible-annonces" className="font-display text-base font-semibold text-foreground">
          {t('listings.heading')}
        </h2>
        <DataState
          loading={annonces.isLoading}
          error={annonces.isError ? messageErreur(annonces.error, t('listings.loadError')) : null}
          onRetry={() => void annonces.refetch()}
          retryLabel={tCommon('actions.retry')}
          isEmpty={!annonces.data || annonces.data.data.length === 0}
          skeletonRows={3}
          skeletonRowClassName="h-24"
          emptyState={(
            <EmptyState
              icon={<Inbox className="size-8" aria-hidden="true" />}
              title={t('listings.empty.title')}
              description={cible.status === 'active' ? t('listings.empty.description') : t('listings.empty.descriptionInactive')}
            />
          )}
        >
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={t('listings.heading')}>
            {(annonces.data?.data ?? []).map((annonce) => <CarteAnnonceTrouvee key={annonce.id} annonce={annonce} />)}
          </ul>
        </DataState>
        {annonces.data && annonces.data.meta.last_page > 1 ? (
          <Pagination page={annonces.data.meta.current_page} lastPage={annonces.data.meta.last_page} onChange={setPage} />
        ) : null}
      </section>
    </div>
  );
}
