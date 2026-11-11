'use client';

import React, { useState } from 'react';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { BookmarkCheck, Trash2, Loader2, Search as SearchIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  useSavedSearchesQuery,
  useDeleteSavedSearchMutation,
  type SavedSearch,
} from '@/lib/queries/saved-searches';
import { EmptyState, ErrorState } from '@/components/feedback';
import { Skeleton } from '@/components/ui/skeleton';
import { Button, buttonVariants } from '@/components/ui/button';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { requeteDesCriteres as criteriaToQueryString } from '@/lib/favoris-suivi';
import { useResumeDeCriteres } from '@/components/favorites/resume-de-criteres';
import { ReglageDAlerte } from '@/components/favorites/ReglageDAlerte';

/**
 * Dashboard "Mes recherches sauvegardées" listing — Wave 3 / TCK-047.
 *
 * For each saved search:
 * - Displays the name and a humanised summary of its criteria.
 * - Provides a "Relancer la recherche" link that rebuilds the URL for
 *   `/properties?` from the stored criteria JSON.
 * - Provides a "Supprimer" action that issues `DELETE /api/saved-searches/{id}`.
 * - TCK-599 (C6) — shows the state of its alert and sets it in place (coupée / quotidienne /
 *   hebdomadaire) through `PATCH { notification_frequency }`, with the EFFECTIVE channels the
 *   API reports (`alert_channels`) — the e-mail is named only when the preference lets it go.
 */
function SavedSearchRow({
  search,
  onDelete,
  deleting,
  deleteError,
}: {
  search: SavedSearch;
  onDelete: (id: number) => void;
  deleting: boolean;
  /** P210.03 (TCK-2084) — le refus de la suppression, déjà traduit, montré sur la ligne. */
  deleteError: string | null;
}) {
  const t = useTranslations('search.saved');
  const resume = useResumeDeCriteres();
  const qs = criteriaToQueryString(search.criteria);
  const href = `/properties${qs ? `?${qs}` : ''}`;
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <BookmarkCheck className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-foreground truncate">
            {search.name}
          </h3>
        </div>
        <p className="mt-1 text-sm text-muted-foreground truncate">
          {resume(search.criteria)}
        </p>
        <ReglageDAlerte search={search} />
        {deleteError ? (
          <p className="mt-2 text-xs text-destructive" role="alert">
            {deleteError}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <LienLocalise
          href={href}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition"
        >
          <SearchIcon className="w-3.5 h-3.5" />
          {t('relaunch')}
        </LienLocalise>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(search.id)}
          disabled={deleting}
          aria-label={t('deleteAria', { name: search.name })}
          className="text-muted-foreground hover:text-destructive"
        >
          {deleting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
        </Button>
      </div>
    </article>
  );
}

export function SavedSearchesList() {
  const t = useTranslations('search.saved');
  const tCommon = useTranslations('common');
  const query = useSavedSearchesQuery();
  const remove = useDeleteSavedSearchMutation();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const messageErreur = useMessageErreurApi();
  // P210.03 (TCK-2084) — la suppression qui échoue se dit sur SA ligne (ADR-0019), qui reste.
  const [erreurSuppression, setErreurSuppression] = useState<{ id: number; message: string } | null>(null);

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <ErrorState
        message={t('error')}
        onRetry={() => void query.refetch()}
        retryLabel={tCommon('actions.retry')}
      />
    );
  }

  const searches = query.data?.data ?? [];
  if (searches.length === 0) {
    return (
      <EmptyState
        icon={<BookmarkCheck className="size-8" aria-hidden="true" />}
        title={t('empty_title')}
        description={t('empty_description')}
        action={
          <LienLocalise href="/properties" className={buttonVariants()}>
            {t('empty_cta')}
          </LienLocalise>
        }
      />
    );
  }

  async function handleDelete(id: number) {
    setPendingId(id);
    setErreurSuppression(null);
    try {
      await remove.mutateAsync({ id });
    } catch (erreur) {
      setErreurSuppression({ id, message: messageErreur(erreur) });
    } finally {
      setPendingId((current) => (current === id ? null : current));
    }
  }

  return (
    <div className="space-y-3">
      {searches.map((s) => (
        <SavedSearchRow
          key={s.id}
          search={s}
          onDelete={(id) => void handleDelete(id)}
          deleting={pendingId === s.id && remove.isPending}
          deleteError={erreurSuppression?.id === s.id ? erreurSuppression.message : null}
        />
      ))}
    </div>
  );
}
