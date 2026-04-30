'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, ShieldAlert } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import {
  fetchModerationQueue,
  type ModerationReview,
  type ModerationStatus,
} from '@/lib/queries/reviews-moderation';
import { ModerationQueueList } from './ModerationQueueList';
import { ModerationDetail } from './ModerationDetail';
import { ApiError } from '@/lib/api';

export function ModerationWorkspace() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<ModerationStatus | ''>('');
  const [reported, setReported] = useState<boolean>(false);
  const [subjectType, setSubjectType] = useState<string>('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const queryKey = useMemo(
    () => ['reviews-moderation', 'queue', { status, reported, subjectType }],
    [status, reported, subjectType],
  );

  const { data, isLoading, isError, error } = useQuery({
    queryKey,
    queryFn: () =>
      fetchModerationQueue(token ?? '', {
        status: status || undefined,
        reported: reported || undefined,
        subjectType: subjectType || undefined,
      }),
    enabled: Boolean(token),
  });

  const reviews = data?.data ?? [];
  const selected = reviews.find((r) => r.id === selectedId) ?? reviews[0] ?? null;

  const onModerated = () => {
    queryClient.invalidateQueries({ queryKey: ['reviews-moderation'] });
    setSelectedId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as ModerationStatus | '')}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-label="Filtrer par statut"
        >
          <option value="">Tous les statuts</option>
          <option value="pending">En attente</option>
          <option value="flagged">Signalés</option>
          <option value="approved">Approuvés</option>
          <option value="rejected">Rejetés</option>
        </select>
        <select
          value={subjectType}
          onChange={(e) => setSubjectType(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-label="Type de sujet"
        >
          <option value="">Tous les sujets</option>
          <option value="App\\Models\\Property">Biens</option>
          <option value="App\\Models\\Agency">Agences</option>
          <option value="App\\Models\\User">Utilisateurs</option>
        </select>
        <label className="inline-flex items-center gap-2 text-sm text-app-ink">
          <input
            type="checkbox"
            checked={reported}
            onChange={(e) => setReported(e.target.checked)}
            className="size-4 rounded border-input"
          />
          Signalés uniquement
        </label>
        {data?.meta ? (
          <p className="ml-auto text-xs text-app-ink-muted">
            {data.meta.pending_count} en file d&apos;attente
          </p>
        ) : null}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl bg-app-surface-1 p-12 text-sm text-app-ink-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Chargement de la file de modération…
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-sm text-destructive">
          {error instanceof ApiError ? error.displayMessage : 'Impossible de charger la file.'}
        </div>
      ) : reviews.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
          <ModerationQueueList
            reviews={reviews}
            selectedId={selected?.id ?? null}
            onSelect={(r: ModerationReview) => setSelectedId(r.id)}
          />
          {selected ? (
            <ModerationDetail review={selected} onModerated={onModerated} />
          ) : null}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl bg-app-surface-1 p-12 text-center">
      <ShieldAlert className="size-8 text-app-accent" />
      <p className="text-sm font-semibold text-app-ink">File vide</p>
      <p className="max-w-md text-xs text-app-ink-muted">
        Aucun avis n&apos;est en attente ou signalé pour le moment.
      </p>
    </div>
  );
}
