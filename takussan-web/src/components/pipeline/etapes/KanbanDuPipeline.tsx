'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useTranslations } from 'next-intl';

import { ETAPES_VIVANTES, type EtatDuPipeline } from '@/lib/crm/pipeline';
import { type CanalDeContactClient } from '@/lib/queries/customer-gestures';
import { PIPELINE_STAGES } from '@/lib/queries/pipeline';
import { cn } from '@/lib/utils';
import type { CustomerPipelineStage } from '@/types/customer';
import type { PipelineCustomerCard, PipelineStats } from '@/types/pipeline';

import type { LectureDuProspect } from '../lecture';
import { useColonnesDuPipeline } from '../usePipeline';
import { BandeauTerminal } from './BandeauTerminal';
import { CarteDuPipeline } from './CarteDuPipeline';
import { ColonneDuPipeline } from './ColonneDuPipeline';
import { versLaColonneVoisine } from './clavier';

interface KanbanProps {
  readonly etat: EtatDuPipeline;
  readonly stats: PipelineStats | undefined;
  readonly lire: (p: PipelineCustomerCard) => LectureDuProspect;
  readonly changer: (p: PipelineCustomerCard, to: CustomerPipelineStage) => void;
  readonly plusTard: (p: PipelineCustomerCard) => void;
  readonly noter?: (id: number) => (channel: CanalDeContactClient) => void;
  /** Les étapes terminales dépliées (la tuile « Conversion » les ouvre). */
  readonly deplies: readonly ('converted' | 'lost')[];
  readonly onDeplier: (stage: 'converted' | 'lost', ouvert: boolean) => void;
}

/**
 * TCK-2592 — le kanban du bureau (maquette `app-pipeline` a-1) : quatre colonnes vivantes pleine
 * hauteur, Gagné et Perdu repliés en bandeaux verticaux qui se déplient ; glisser au pointeur ou au
 * clavier (Espace, ← →, Espace, Échap), annonces pour lecteur d'écran, cible surlignée — vers une
 * colonne comme vers un bandeau, qui demande le motif. Sous `xl`, les colonnes gardent 200 px et le
 * kanban défile dans sa zone, jamais la page.
 */
export function KanbanDuPipeline({ etat, stats, lire, changer, plusTard, noter, deplies, onDeplier }: KanbanProps) {
  const t = useTranslations('crm.pipeline');
  const tCrm = useTranslations('agentCrm.pipeline');
  const lues = [...ETAPES_VIVANTES, ...deplies] as CustomerPipelineStage[];
  const colonnes = useColonnesDuPipeline(etat, lues);
  const [enVol, setEnVol] = useState<PipelineCustomerCard | null>(null);
  // La panne d'un « Charger plus » se dit en alerte, et s'efface seule après 4 s, comme celle de la page.
  const effacer = useEffectEvent(() => colonnes.effacerErreur());
  useEffect(() => {
    if (!colonnes.erreur) return;
    const id = setTimeout(effacer, 4000);
    return () => clearTimeout(id);
  }, [colonnes.erreur]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: versLaColonneVoisine }),
  );

  const toutes = () => lues.flatMap((s) => colonnes.cartes(s));
  const trouver = (id: unknown) => toutes().find((c) => c.id === Number(id));
  const nomDe = (id: unknown) => {
    const c = trouver(id);
    return c ? lire(c).nom : '';
  };
  const etapeDe = (id: unknown) => ((PIPELINE_STAGES as readonly unknown[]).includes(id) ? t(`stage.${id as CustomerPipelineStage}`) : '');
  const announcements: Announcements = {
    onDragStart: ({ active }) => tCrm('dnd.start', { name: nomDe(active.id) }),
    onDragOver: ({ active, over }) => (over ? tCrm('dnd.over', { name: nomDe(active.id), stage: etapeDe(over.id) }) : tCrm('dnd.overNone', { name: nomDe(active.id) })),
    onDragEnd: ({ active, over }) => (over ? tCrm('dnd.end', { name: nomDe(active.id), stage: etapeDe(over.id) }) : tCrm('dnd.endNone', { name: nomDe(active.id) })),
    onDragCancel: ({ active }) => tCrm('dnd.cancel', { name: nomDe(active.id) }),
  };

  const onDragStart = (e: DragStartEvent) => setEnVol(trouver(e.active.id) ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    const carte = trouver(e.active.id);
    setEnVol(null);
    if (!carte || !e.over) return;
    const to = e.over.id as CustomerPipelineStage;
    if (to !== carte.pipeline_stage) changer(carte, to);
  };

  const compte = (s: CustomerPipelineStage) => stats?.stage_counts?.[s];
  const mediane = (s: CustomerPipelineStage) => stats?.median_days_in_stage?.[s] ?? null;

  const colonne = (stage: CustomerPipelineStage, replier?: () => void) => {
    const cartes = colonnes.cartes(stage);
    return (
      <ColonneDuPipeline
        key={stage}
        stage={stage}
        total={compte(stage)}
        chargees={cartes.length}
        mediane={replier ? undefined : mediane(stage)}
        onLoadMore={() => void colonnes.chargerPlus(stage)}
        isLoadingMore={colonnes.chargeant === stage}
        onReplier={replier}
        className="max-xl:min-w-[calc(var(--spacing)*50)]"
        {...colonnes.etatDe(stage)}
      >
        {cartes.map((p) => (
          <CarteDuPipeline key={p.id} prospect={p} lecture={lire(p)} noter={noter?.(p.id)} onEtape={changer} onPlusTard={plusTard} />
        ))}
      </ColonneDuPipeline>
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setEnVol(null)}
      accessibility={{ announcements, screenReaderInstructions: { draggable: tCrm('dnd.instructions') } }}
    >
      <div data-testid="pipeline-kanban" className="flex min-h-0 flex-1 gap-3 max-xl:overflow-x-auto max-xl:overscroll-x-contain">
        {ETAPES_VIVANTES.map((s) => colonne(s))}
        {(['converted', 'lost'] as const).map((s) =>
          deplies.includes(s) ? (
            colonne(s, () => onDeplier(s, false))
          ) : (
            <BandeauTerminal key={s} stage={s} total={compte(s)} onDeplier={() => onDeplier(s, true)} />
          ),
        )}
      </div>
      <DragOverlay>{enVol ? <CarteDuPipeline prospect={enVol} lecture={lire(enVol)} apercu /> : null}</DragOverlay>
      {colonnes.erreur ? (
        <div role="alert" className={cn('fixed inset-x-4 bottom-[var(--floating-dock-base)] z-50 rounded-lg border border-destructive/30 bg-card px-4 py-3 text-sm text-destructive shadow-lg sm:left-auto sm:right-24 sm:max-w-sm md:bottom-4')}>
          {colonnes.erreur}
        </div>
      ) : null}
    </DndContext>
  );
}
