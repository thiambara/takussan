'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ShieldCheck } from 'lucide-react';
import { EmptyState, ErrorState } from '@/components/feedback';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ModerationDecisionPanel,
  ModerationFilters,
  ModerationQueueTable,
  ModerationStats,
} from '@/components/admin/super/moderation';
import { Button } from '@/components/ui/button';
import { fetchAdminAgencies, fetchModerationQueue } from '@/lib/queries/super-admin';
import type {
  AdminAgenciesResponse,
  AdminModerationItem,
  AdminModerationResponse,
  ModerationItemStatus,
  ModerationItemType,
} from '@/types/super-admin';
import type { ApiError } from '@/lib/api';

export default function SuperAdminModerationPage() {
  const t = useTranslations('superAdmin.moderation');
  const searchParams = useSearchParams();
  const router = useRouter();
  const [selected, setSelected] = useState<AdminModerationItem | null>(null);

  const params = useMemo(
    () => ({
      type: (searchParams.get('filter[type]') as ModerationItemType | null) ?? undefined,
      status: (searchParams.get('filter[status]') as ModerationItemStatus | null) ?? undefined,
      agencyId: searchParams.get('filter[agency_id]')
        ? Number(searchParams.get('filter[agency_id]'))
        : undefined,
      sort: searchParams.get('sort') ?? '-reported_at',
      page: Number.parseInt(searchParams.get('page') ?? '1', 10) || 1,
      perPage: 20,
    }),
    [searchParams],
  );

  const queueQuery = useQuery<AdminModerationResponse, ApiError>({
    queryKey: ['super-admin', 'moderation', params],
    queryFn: () => fetchModerationQueue(params),
    staleTime: 15_000,
  });

  const agenciesQuery = useQuery<AdminAgenciesResponse, ApiError>({
    queryKey: ['super-admin', 'agencies', 'moderation-filter'],
    queryFn: () => fetchAdminAgencies({ perPage: 50 }),
    staleTime: 5 * 60_000,
  });

  const agencies = useMemo(
    () => (agenciesQuery.data?.data ?? []).map((agency) => ({ id: agency.id, name: agency.name })),
    [agenciesQuery.data],
  );

  const items = queueQuery.data?.data ?? [];
  const meta = queueQuery.data?.meta;

  const goTo = (page: number) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set('page', String(page));
    router.replace(`?${next.toString()}`);
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">Modération</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          File plateforme cross-tenant pour les biens et avis en attente ou signalés.
        </p>
      </header>

      <ModerationStats items={items} total={meta?.total ?? 0} />
      <ModerationFilters agencies={agencies} />

      {queueQuery.isLoading ? (
        <div className="space-y-2" data-testid="moderation-loading">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-12 animate-pulse rounded-md bg-muted" aria-hidden="true" />
          ))}
        </div>
      ) : queueQuery.isError ? (
        <ErrorState message={queueQuery.error.displayMessage ?? t('error')} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="size-8" aria-hidden="true" />}
          title={t('empty_title')}
          description={t('empty_description')}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <ModerationQueueTable
              items={items}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
            />
            {meta && meta.last_page > 1 ? (
              <nav className="flex items-center justify-between text-sm text-muted-foreground" aria-label="Pagination">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => goTo(Math.max(1, meta.current_page - 1))}
                  disabled={meta.current_page <= 1}
                >
                  Précédent
                </Button>
                <span>Page {meta.current_page} sur {meta.last_page}</span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => goTo(Math.min(meta.last_page, meta.current_page + 1))}
                  disabled={meta.current_page >= meta.last_page}
                >
                  Suivant
                </Button>
              </nav>
            ) : null}
          </div>
          <ModerationDecisionPanel
            item={selected}
            onDone={() => {
              setSelected(null);
              queueQuery.refetch();
            }}
          />
        </div>
      )}
    </div>
  );
}
