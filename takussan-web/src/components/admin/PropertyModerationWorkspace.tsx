'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Loader2, ShieldCheck } from 'lucide-react';

import { EmptyState } from '@/components/feedback';

import { useAuth } from '@/context/AuthContext';
import { fetchPropertyModerationQueue } from '@/lib/queries/property-moderation';
import type { ModerationProperty } from '@/lib/queries/property-moderation';
import { PropertyModerationQueueList } from './PropertyModerationQueueList';
import { PropertyModerationDetail } from './PropertyModerationDetail';
import { ApiError } from '@/lib/api';

export function PropertyModerationWorkspace() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const queryKey = ['property-moderation', 'queue', { search }];

  const { data, isLoading, isError, error } = useQuery({
    queryKey,
    queryFn: () =>
      fetchPropertyModerationQueue(token ?? '', { search: search || undefined }),
    enabled: Boolean(token),
  });

  const properties = data?.data ?? [];
  const selected =
    properties.find((p) => p.id === selectedId) ?? properties[0] ?? null;

  const onModerated = () => {
    queryClient.invalidateQueries({ queryKey: ['property-moderation'] });
    setSelectedId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un bien…"
          className="h-9 w-64 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        {data?.meta ? (
          <p className="ml-auto text-xs text-app-ink-muted">
            {data.meta.pending_count} bien(s) en attente
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
      ) : properties.length === 0 ? (
        <PropertyModerationEmpty />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
          <PropertyModerationQueueList
            properties={properties}
            selectedId={selected?.id ?? null}
            onSelect={(p: ModerationProperty) => setSelectedId(p.id)}
          />
          {selected ? (
            <PropertyModerationDetail property={selected} onModerated={onModerated} />
          ) : null}
        </div>
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
