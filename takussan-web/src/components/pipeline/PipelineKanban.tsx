'use client';

import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';

import { useAuth } from '@/context/AuthContext';
import { useCustomerStageMutation } from '@/hooks/useCustomerStageMutation';
import { PIPELINE_QUERY_KEY } from '@/hooks/pipelineKeys';
import { PIPELINE_COLUMN_PAGE_SIZE, fetchPipelineColumn, fetchPipelineStats } from '@/lib/queries/pipeline';
import { cn } from '@/lib/utils';
import type { CustomerPipelineStage } from '@/types/customer';
import type { PipelineCustomerCard } from '@/types/pipeline';

import { CustomerDetailSheet } from './CustomerDetailSheet';
import { PipelineCard } from './PipelineCard';
import { PipelineColumn } from './PipelineColumn';
import { PipelineStatsBar } from './PipelineStatsBar';
import { ReasonDialog } from './ReasonDialog';
import { PIPELINE_STAGES, TERMINAL_STAGES } from './constants';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

interface PendingReason {
  customerId: number;
  from: CustomerPipelineStage;
  to: CustomerPipelineStage;
  card: PipelineCustomerCard;
}

export function PipelineKanban() {
  const t = useTranslations('crm.pipeline');
  const tCrm = useTranslations('agentCrm.pipeline');
  const queryClient = useQueryClient();
  const messageErreur = useMessageErreurApi();
  const locale = useLocale();
  const { token } = useAuth();
  const stageMutation = useCustomerStageMutation();

  const [selectedCustomer, setSelectedCustomer] = useState<number | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [pendingReason, setPendingReason] = useState<PendingReason | null>(null);
  const [mobileStage, setMobileStage] = useState<CustomerPipelineStage>('lead');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState<CustomerPipelineStage | null>(null);

  // TCK-591 — le capteur clavier : Espace saisit la carte, les flèches la déplacent, Espace la
  // repose, Échap annule. Le sélecteur d'étape de chaque carte reste la voie la plus directe.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  // Per-column data — TanStack Query fans out one fetch per stage. Each
  // result is cached under a stable key so the optimistic-mutation hook can
  // update the right column atomically.
  const columns = useQueries({
    queries: PIPELINE_STAGES.map((stage) => ({
      queryKey: PIPELINE_QUERY_KEY.column(stage),
      queryFn: async () => {
        if (!token) return [] as PipelineCustomerCard[];
        return fetchPipelineColumn(token, { stage });
      },
      enabled: !!token,
      staleTime: 30_000,
    })),
  });

  const stats = useQuery({
    queryKey: PIPELINE_QUERY_KEY.stats(),
    queryFn: async () => {
      if (!token) return null;
      return fetchPipelineStats(token);
    },
    enabled: !!token,
    staleTime: 60_000,
  });

  const allCards: Record<CustomerPipelineStage, PipelineCustomerCard[]> =
    PIPELINE_STAGES.reduce(
      (acc, stage, idx) => {
        acc[stage] = (columns[idx]?.data ?? []) as PipelineCustomerCard[];
        return acc;
      },
      {} as Record<CustomerPipelineStage, PipelineCustomerCard[]>,
    );

  const columnState = (idx: number) => {
    const q = columns[idx];
    return {
      // `isPending` seul, et non `fetchStatus` : le serveur rend `idle` là où le premier rendu
      // client rend `fetching`, et l'écart casse l'hydratation. Sans jeton, rien ne chargera.
      isLoading: !!token && q?.isPending,
      isError: q?.isError,
      onRetry: () => void q?.refetch(),
    };
  };

  /** TCK-591 — le compte d'une étape vient des statistiques, jamais de la liste chargée. */
  const totalOf = (stage: CustomerPipelineStage): number | undefined => stats.data?.stage_counts?.[stage];

  /** Ajoute la page suivante au cache de la colonne (dédoublonnée : une carte a pu bouger entre-temps). */
  const loadMore = async (stage: CustomerPipelineStage) => {
    if (!token || loadingMore) return;
    const loaded = allCards[stage];
    setLoadingMore(stage);
    try {
      const page = Math.floor(loaded.length / PIPELINE_COLUMN_PAGE_SIZE) + 1;
      const next = await fetchPipelineColumn(token, { stage, page });
      queryClient.setQueryData<PipelineCustomerCard[]>(PIPELINE_QUERY_KEY.column(stage), (old) => {
        const seen = new Set((old ?? []).map((c) => c.id));
        return [...(old ?? []), ...next.filter((c) => !seen.has(c.id))];
      });
    } catch (err) {
      setErrorMessage(messageErreur(err, t('errors.loadFailed')));
      setTimeout(() => setErrorMessage(null), 4000);
    } finally {
      setLoadingMore(null);
    }
  };

  const nameOf = (id: unknown) => {
    const card = Object.values(allCards).flat().find((c) => c.id === Number(id));
    return card ? `${card.first_name} ${card.last_name}` : '';
  };
  const stageName = (id: unknown) =>
    PIPELINE_STAGES.includes(id as CustomerPipelineStage) ? t(`stage.${id as CustomerPipelineStage}`) : '';
  const announcements: Announcements = {
    onDragStart: ({ active }) => tCrm('dnd.start', { name: nameOf(active.id) }),
    onDragOver: ({ active, over }) =>
      over
        ? tCrm('dnd.over', { name: nameOf(active.id), stage: stageName(over.id) })
        : tCrm('dnd.overNone', { name: nameOf(active.id) }),
    onDragEnd: ({ active, over }) =>
      over
        ? tCrm('dnd.end', { name: nameOf(active.id), stage: stageName(over.id) })
        : tCrm('dnd.endNone', { name: nameOf(active.id) }),
    onDragCancel: ({ active }) => tCrm('dnd.cancel', { name: nameOf(active.id) }),
  };

  /** Même chemin que le dépôt : une étape terminale demande son motif. */
  const changeStage = (card: PipelineCustomerCard, to: CustomerPipelineStage) => {
    const from = card.pipeline_stage;
    if (from === to) return;
    if (TERMINAL_STAGES.includes(to)) {
      setPendingReason({ customerId: card.id, from, to, card });
      return;
    }
    runStageMutation(card.id, from, to);
  };

  const draggedCard =
    activeId === null
      ? null
      : Object.values(allCards)
          .flat()
          .find((c) => c.id === activeId) ?? null;

  const onDragStart = (e: DragStartEvent) => {
    const id = Number(e.active.id);
    if (!Number.isFinite(id)) return;
    setActiveId(id);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const customerId = Number(e.active.id);
    setActiveId(null);
    if (!e.over) return;
    const to = e.over.id as CustomerPipelineStage;

    // Find current stage from local cache
    let from: CustomerPipelineStage | null = null;
    let card: PipelineCustomerCard | undefined;
    for (const stage of PIPELINE_STAGES) {
      const c = allCards[stage].find((x) => x.id === customerId);
      if (c) {
        from = stage;
        card = c;
        break;
      }
    }
    if (!from || !card || from === to) return;
    changeStage(card, to);
  };

  const runStageMutation = (
    customerId: number,
    from: CustomerPipelineStage,
    to: CustomerPipelineStage,
    reason?: string,
  ) => {
    stageMutation.mutate(
      { customerId, from, to, reason },
      {
        onError: (err) => {
          setErrorMessage(messageErreur(err, t('errors.moveFailed')));
          setTimeout(() => setErrorMessage(null), 4000);
        },
      },
    );
  };

  return (
    <div className="space-y-4" suppressHydrationWarning data-locale={locale}>
      <PipelineStatsBar stats={stats.data ?? undefined} isLoading={stats.isLoading} />

      {/* Mobile: tab switcher — one stage at a time */}
      <div className="md:hidden">
        {/*
          Revue design 2026-09-16 — onglets à 28 px de haut en `text-xs` : sous le plancher tactile
          de 44 px. Rayons concentriques : conteneur `rounded-xl` = onglet `rounded-lg` + `p-1`.
        */}
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-card p-1 text-sm">
          {PIPELINE_STAGES.map((stage, idx) => (
            <button
              key={stage}
              type="button"
              aria-pressed={mobileStage === stage}
              onClick={() => setMobileStage(stage)}
              className={cn(
                'min-h-11 whitespace-nowrap rounded-lg px-3 font-medium transition-colors duration-150',
                mobileStage === stage
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {t(`stage.${stage}`)}
              {columns[idx]?.isSuccess ? (
                <span className="ml-1.5 tabular-nums opacity-70">
                  ({Math.max(totalOf(stage) ?? 0, allCards[stage].length)})
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="mt-3 h-[60vh]">
          <PipelineColumn
            className="w-full"
            stage={mobileStage}
            customers={allCards[mobileStage]}
            onSelect={setSelectedCustomer}
            onStageChange={changeStage}
            total={totalOf(mobileStage)}
            onLoadMore={() => void loadMore(mobileStage)}
            isLoadingMore={loadingMore === mobileStage}
            {...columnState(PIPELINE_STAGES.indexOf(mobileStage))}
          />
        </div>
      </div>

      {/* Desktop: horizontal scroll kanban */}
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: tCrm('dnd.instructions') },
        }}
      >
        <div
          className="hidden snap-x overflow-x-auto overscroll-x-contain md:block"
          data-testid="pipeline-kanban"
        >
          <div className="flex h-[70vh] min-w-max gap-3 pb-2">
            {PIPELINE_STAGES.map((stage, idx) => (
              <PipelineColumn
                key={stage}
                stage={stage}
                customers={allCards[stage]}
                onSelect={setSelectedCustomer}
                onStageChange={changeStage}
                total={totalOf(stage)}
                onLoadMore={() => void loadMore(stage)}
                isLoadingMore={loadingMore === stage}
                isDropTarget={activeId !== null && draggedCard?.pipeline_stage !== stage}
                {...columnState(idx)}
              />
            ))}
          </div>
        </div>

        <DragOverlay>
          {draggedCard ? (
            <PipelineCard
              customer={draggedCard}
              onSelect={() => undefined}
              isDragging
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {errorMessage ? (
        <div
          role="alert"
          className="fixed inset-x-4 bottom-24 z-50 rounded-lg border border-destructive/30 bg-card px-4 py-3 text-sm text-destructive shadow-lg sm:bottom-4 sm:left-auto sm:right-24 sm:max-w-sm"
        >
          {errorMessage}
        </div>
      ) : null}

      <ReasonDialog
        pending={pendingReason}
        onCancel={() => setPendingReason(null)}
        onSubmit={(reason) => {
          if (!pendingReason) return;
          const { customerId, from, to } = pendingReason;
          runStageMutation(customerId, from, to, reason);
          setPendingReason(null);
        }}
      />

      {selectedCustomer !== null ? (
        <CustomerDetailSheet
          customerId={selectedCustomer}
          onOpenChange={(open) => {
            if (!open) setSelectedCustomer(null);
          }}
        />
      ) : null}
    </div>
  );
}
