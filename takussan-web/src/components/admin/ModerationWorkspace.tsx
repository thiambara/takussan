'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, ShieldAlert } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  fetchModerationQueue,
  type ModerationReview,
  type ModerationStatus,
} from '@/lib/queries/reviews-moderation';
import { ModerationQueueList } from './ModerationQueueList';
import { ModerationDetail } from './ModerationDetail';
import { ApiError } from '@/lib/api';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tous les statuts' },
  { value: 'pending', label: 'En attente' },
  { value: 'flagged', label: 'Signalés' },
  { value: 'approved', label: 'Approuvés' },
  { value: 'rejected', label: 'Rejetés' },
] as const;

const SUBJECT_TYPE_OPTIONS = [
  { value: 'all', label: 'Tous les sujets' },
  { value: 'App\\Models\\Property', label: 'Biens' },
  { value: 'App\\Models\\Agency', label: 'Agences' },
  { value: 'App\\Models\\User', label: 'Utilisateurs' },
] as const;

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
        <Select
          value={status || 'all'}
          onValueChange={(value) => setStatus(value === 'all' ? '' : ((value ?? '') as ModerationStatus | ''))}
          items={STATUS_OPTIONS as unknown as Array<{ value: string; label: string }>}
        >
          <SelectTrigger className="h-9" aria-label="Filtrer par statut">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={subjectType || 'all'}
          onValueChange={(value) => setSubjectType(value === 'all' ? '' : (value ?? ''))}
          items={SUBJECT_TYPE_OPTIONS as unknown as Array<{ value: string; label: string }>}
        >
          <SelectTrigger className="h-9" aria-label="Type de sujet">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUBJECT_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
