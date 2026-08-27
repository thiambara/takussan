'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Loader2, ShieldCheck } from 'lucide-react';

import { EmptyState } from '@/components/feedback';

import { useAuth } from '@/context/AuthContext';
import { DebouncedSearchInput, FilterBar, Pagination } from '@/components/console';
import { fetchPropertyModerationQueue } from '@/lib/queries/property-moderation';
import type { ModerationProperty } from '@/lib/queries/property-moderation';
import { PropertyModerationQueueList } from './PropertyModerationQueueList';
import { PropertyModerationDetail } from './PropertyModerationDetail';

import { useEtatUrl } from '@/hooks/useEtatUrl';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

/** Même convention que la file d'avis : la clé d'URL est le nom du filtre d'API. */
const P_RECHERCHE = 'filter[search]';

const PAR_PAGE = 20;

export function PropertyModerationWorkspace() {
  const t = useTranslations('admin.propertyModeration');
  const messageErreur = useMessageErreurApi();
  const { token } = useAuth();
  const queryClient = useQueryClient();

  // TCK-376 — la recherche et la page vivent dans l'URL. Elles vivaient en `useState` : un
  // rechargement les perdait, et la file n'avait de toute façon pas de seconde page.
  const url = useEtatUrl();
  const search = url.lire(P_RECHERCHE);
  const page = url.page;
  const selectedId = Number.parseInt(url.lire('selected'), 10) || null;

  const queryKey = ['property-moderation', 'queue', { search, page }];

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey,
    queryFn: () =>
      fetchPropertyModerationQueue(token ?? '', {
        search: search || undefined,
        page,
        perPage: PAR_PAGE,
      }),
    enabled: Boolean(token),
  });

  const properties = data?.data ?? [];
  const selected =
    properties.find((p) => p.id === selectedId) ?? properties[0] ?? null;
  const meta = data?.meta;

  const onModerated = () => {
    queryClient.invalidateQueries({ queryKey: ['property-moderation'] });
    url.selectionner(null);
  };

  return (
    <div className="space-y-4">
      <FilterBar
        controlsClassName="flex flex-wrap items-center gap-3"
        resultCount={meta ? t('pendingCount', { count: meta.pending_count }) : undefined}
      >
        {/*
          TCK-376 — le champ nu envoyait une requête par frappe, et écrirait désormais aussi une
          entrée d'historique par frappe. Le porter dans l'URL SANS temporisation aurait donc
          aggravé le défaut au lieu de le corriger : c'est la primitive de TCK-363 qui tient les
          deux bouts.
        */}
        <DebouncedSearchInput
          className="w-72"
          value={search}
          onCommit={(next) => url.poserFiltres({ [P_RECHERCHE]: next || null })}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchAria')}
          busy={isFetching}
        />
      </FilterBar>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl bg-card p-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {t('loading')}
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-sm text-destructive">
          {messageErreur(error, t('loadError'))}
        </div>
      ) : properties.length === 0 ? (
        <PropertyModerationEmpty />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
            <PropertyModerationQueueList
              properties={properties}
              selectedId={selected?.id ?? null}
              onSelect={(p: ModerationProperty) => url.selectionner(p.id)}
            />
            {selected ? (
              <PropertyModerationDetail property={selected} onModerated={onModerated} />
            ) : null}
          </div>
          {meta ? (
            <Pagination
              page={page}
              lastPage={meta.last_page}
              onChange={url.allerALaPage}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function PropertyModerationEmpty() {
  const t = useTranslations('admin.moderation.properties');
  return (
    <EmptyState
      icon={<ShieldCheck className="size-8" aria-hidden="true" />}
      title={t('empty_title')}
      description={t('empty_description')}
    />
  );
}
