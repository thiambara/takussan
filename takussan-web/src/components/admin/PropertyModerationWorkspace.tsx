'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';

import { EmptyState, ErrorState } from '@/components/feedback';
import { PageHeader } from '@/components/console';
import { Skeleton } from '@/components/ui/skeleton';
import { PuceDeFiltre, RangeeDePuces } from '@/components/ui/puce-de-filtre';
import { Tabs, TabsCount, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { REQUETE_DE_LA_BARRE } from '@/components/layout/plein-ecran';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';

import { useAuth } from '@/context/AuthContext';
import { DebouncedSearchInput } from '@/components/console/DebouncedSearchInput';
import { Pagination } from '@/components/console/Pagination';
import { fetchPropertyModerationQueue } from '@/lib/queries/property-moderation';
import type { ModerationProperty } from '@/lib/queries/property-moderation';
import { fetchModerationQueue } from '@/lib/queries/reviews-moderation';
import { PropertyModerationQueueList } from './PropertyModerationQueueList';
import { PropertyModerationDetail } from './PropertyModerationDetail';

import { useEtatUrl } from '@/hooks/useEtatUrl';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

/** Même convention que la file d'avis : la clé d'URL est le nom du filtre d'API. */
const P_RECHERCHE = 'filter[search]';

const PAR_PAGE = 20;
const PAGE_DES_AVIS = '/app/agency/moderation';

/**
 * TCK-098 → TCK-2673 — les biens à valider (maquette `app-moderation` B, « Bien à valider »).
 *
 *  · Bureau : le même en-tête que la file des avis (titre, compte du jour, onglets « Avis · Biens à
 *    valider »), la recherche ; les biens en attente en une bande, puis l'APERÇU du bien ouvert tel
 *    que le public le verra, avec la liste de contrôle et les deux gestes à côté (dès `xl`).
 *  · Téléphone : les pastilles de la modération (« Biens » active), la liste ; toucher un bien ouvre
 *    son aperçu plein écran (une entrée d'historique : le retour rend la liste).
 */
export function PropertyModerationWorkspace() {
  const t = useTranslations('admin.propertyModeration');
  const tBien = useTranslations('admin.propertyModeration.bien');
  const tFile = useTranslations('admin.moderation.file');
  const tPage = useTranslations('admin.pages.moderation');
  const tCommon = useTranslations('common');
  const messageErreur = useMessageErreurApi();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const telephone = useMatchesMedia(REQUETE_DE_LA_BARRE);
  const [annonce, setAnnonce] = useState<string | null>(null);

  // TCK-376 — la recherche, la page et la sélection vivent dans l'URL.
  const url = useEtatUrl();
  const search = url.lire(P_RECHERCHE);
  const page = url.page;
  const selectedId = Number.parseInt(url.lire('selected'), 10) || null;

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['property-moderation', 'queue', { search, page }],
    queryFn: () =>
      fetchPropertyModerationQueue(token ?? '', {
        search: search || undefined,
        page,
        perPage: PAR_PAGE,
      }),
    enabled: Boolean(token),
  });

  // Les comptes des avis du jour, pour l'en-tête et l'onglet « Avis » (`meta.risk_counts`, TCK-2672).
  const avis = useQuery({
    queryKey: ['reviews-moderation', 'risk-counts'],
    queryFn: () => fetchModerationQueue(token ?? '', { status: 'pending', page: 1, perPage: 1 }),
    enabled: Boolean(token),
    select: (r) => r.meta.risk_counts ?? null,
  });
  const comptesAvis = avis.data ?? null;

  const properties = data?.data ?? [];
  const meta = data?.meta;
  const selected = properties.find((p) => p.id === selectedId) ?? (telephone ? null : (properties[0] ?? null));

  const hrefDeLaFile = (() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('selected');
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  })();

  const ouvrir = (p: ModerationProperty) => {
    setAnnonce(null);
    if (telephone) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('selected', String(p.id));
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
      return;
    }
    url.selectionner(p.id);
  };

  const onModerated = (message?: string) => {
    setAnnonce(message ?? null);
    void queryClient.invalidateQueries({ queryKey: ['property-moderation'] });
    if (telephone) router.replace(hrefDeLaFile, { scroll: false });
    else url.selectionner(null);
  };

  const recherche = (
    <DebouncedSearchInput
      className="w-full md:w-[calc(var(--spacing)*75)]"
      value={search}
      onCommit={(next) => url.poserFiltres({ [P_RECHERCHE]: next || null })}
      placeholder={t('searchPlaceholder')}
      aria-label={t('searchAria')}
      busy={isFetching}
    />
  );

  const annonceRendue = annonce ? (
    <p role="status" className="rounded-lg bg-muted px-4 py-3 text-sm">
      {annonce}
    </p>
  ) : null;

  const etat = isLoading ? (
    <div role="status" className="space-y-3">
      <span className="sr-only">{t('loading')}</span>
      <Skeleton className="h-16 rounded-xl" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  ) : isError ? (
    <ErrorState message={messageErreur(error, t('loadError'))} onRetry={() => void refetch()} retryLabel={tCommon('actions.retry')} />
  ) : properties.length === 0 ? (
    <PropertyModerationEmpty />
  ) : null;

  /*
    ⚠ TCK-376 — la pagination est rendue HORS de la branche « la liste n'est pas vide » : une page
    devenue vide (on a modéré ses dernières lignes) garde « Précédent », sans quoi l'écran affichait
    « aucun bien à valider » sans chemin de retour. `Pagination` ne rend rien quand `lastPage <= 1`.
  */
  const pagination = meta ? <Pagination page={page} lastPage={meta.last_page} onChange={url.allerALaPage} /> : null;

  /* ── Téléphone ─────────────────────────────────────────────────────────────────────────── */

  if (telephone) {
    if (selected) {
      const i = properties.findIndex((p) => p.id === selected.id);
      const n = meta?.total ?? properties.length;
      return (
        <>
          <DeclarerEnTete forme="detail" titre={tBien('titreTelephone', { i: (page - 1) * PAR_PAGE + i + 1, n })} repli={hrefDeLaFile} />
          <PropertyModerationDetail key={selected.id} property={selected} onModerated={onModerated} telephone />
        </>
      );
    }
    return (
      <PagePleineLargeur className="pb-4" data-slot="biens-a-valider">
        <DeclarerEnTete titre={tPage('title')} />
        <RangeeDePuces aria-label={tFile('puces.aria')} className="px-4 py-3">
          <PuceDeFiltre onClick={() => router.push(PAGE_DES_AVIS)} compte={comptesAvis?.high}>
            {tFile('puces.risque')}
          </PuceDeFiltre>
          <PuceDeFiltre onClick={() => router.push(`${PAGE_DES_AVIS}?filter%5Brisk%5D=low`)} compte={comptesAvis?.low}>
            {tFile('puces.sansRisque')}
          </PuceDeFiltre>
          <PuceDeFiltre active compte={meta?.pending_count}>
            {tFile('puces.biens')}
          </PuceDeFiltre>
        </RangeeDePuces>
        <div className="space-y-3 px-4 pb-3">
          {recherche}
          {annonceRendue}
        </div>
        {etat ?? <PropertyModerationQueueList forme="liste" properties={properties} selectedId={null} onSelect={ouvrir} />}
        <div className="px-4 pt-3">{pagination}</div>
      </PagePleineLargeur>
    );
  }

  /* ── Bureau ────────────────────────────────────────────────────────────────────────────── */

  const nbBiens = meta?.pending_count ?? null;
  const nbAvis = comptesAvis ? comptesAvis.high + comptesAvis.low : null;
  const sousTitre =
    comptesAvis && nbBiens !== null
      ? tFile('sousTitre', { avis: nbAvis ?? 0, risque: comptesAvis.high, biens: nbBiens })
      : nbBiens !== null
        ? t('pendingCount', { count: nbBiens })
        : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title={tPage('title')}
        description={sousTitre}
        actions={recherche}
        dessous={
          <Tabs value="biens" onValueChange={(v) => v === 'avis' && router.push(PAGE_DES_AVIS)}>
            <TabsList variant="line" aria-label={tFile('onglets.aria')}>
              <TabsTrigger value="avis">
                {tFile('onglets.avis')}
                {nbAvis !== null ? <TabsCount>{nbAvis}</TabsCount> : null}
              </TabsTrigger>
              <TabsTrigger value="biens">
                {tFile('onglets.biens')}
                {nbBiens !== null ? <TabsCount>{nbBiens}</TabsCount> : null}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />
      {annonceRendue}
      {etat ?? (
        <>
          {properties.length > 1 ? <PropertyModerationQueueList properties={properties} selectedId={selected?.id ?? null} onSelect={ouvrir} /> : null}
          {selected ? <PropertyModerationDetail key={selected.id} property={selected} onModerated={onModerated} /> : null}
        </>
      )}
      {pagination}
    </div>
  );
}

function PropertyModerationEmpty() {
  const t = useTranslations('admin.moderation.properties');
  return <EmptyState icon={<ShieldCheck className="size-8" aria-hidden="true" />} title={t('empty_title')} description={t('empty_description')} />;
}
