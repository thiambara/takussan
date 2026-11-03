'use client';

import { CSSProperties } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Calendar, ListTodo } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { ContactGestures } from '@/components/crm/ContactGestures';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Locale } from '@/i18n/config';
import { formatDate } from '@/lib/format';
import { nomAffichable, nomCompletDe } from '@/lib/identite';
import { cn } from '@/lib/utils';
import type { CustomerPipelineStage } from '@/types/customer';
import type { PipelineCustomerCard } from '@/types/pipeline';

import { PIPELINE_STAGES } from './constants';

interface PipelineCardProps {
  customer: PipelineCustomerCard;
  onSelect: (id: number) => void;
  /**
   * TCK-591 — changer l'étape SANS glisser : au doigt sur 360 px (où la vue mobile n'a pas de
   * glisser-déposer) comme au clavier. Absent sur l'aperçu de glisser.
   */
  onStageChange?: (customer: PipelineCustomerCard, to: CustomerPipelineStage) => void;
  /** When true, this card is the drag preview ghost. */
  isDragging?: boolean;
}

function initialsOf(card: PipelineCustomerCard): string {
  const first = card.first_name?.[0] ?? '';
  const last = card.last_name?.[0] ?? '';
  return (first + last).toUpperCase() || '?';
}


/** Ce qui se passe dans le sélecteur d'étape ou sur un geste de contact ne remonte pas à la carte. */
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

export function PipelineCard({
  customer,
  onSelect,
  onStageChange,
  isDragging,
}: PipelineCardProps) {
  const t = useTranslations('crm.pipeline.card');
  const tStage = useTranslations('crm.pipeline.stage');
  const tCrm = useTranslations('agentCrm.pipeline');
  // La locale de l'APP, pas celle du navigateur : `Intl.DateTimeFormat(undefined)` rendait
  // « Sep 2, 2026 » dans une interface française.
  const locale = useLocale() as Locale;
  const { attributes, listeners, setNodeRef, transform, isDragging: localDragging } =
    useDraggable({ id: customer.id, data: { customer } });

  const style: CSSProperties = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : {};

  // P220.03 (TCK-2281) — la fiche se nomme par `nomAffichable` (numéro, sinon `#<id>`). Son
  // auteur, chargé sans contact, garde sa ligne cachée quand il n'a pas de nom, comme avant.
  const nom = nomAffichable(customer);
  const optionsEtape = PIPELINE_STAGES.map((stage) => ({ value: stage, label: tStage(stage) }));
  const addedByName = customer.added_by?.full_name || nomCompletDe(customer.added_by);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      tabIndex={0}
      onClick={() => onSelect(customer.id)}
      // TCK-591 — Entrée ouvre la fiche ; Espace appartient au capteur clavier de dnd-kit (saisir,
      // déplacer aux flèches, reposer). Il ouvrait la fiche lui aussi : le glisser au clavier
      // n'existait pas.
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          onSelect(customer.id);
          return;
        }
        listeners?.onKeyDown?.(e);
      }}
      style={style}
      className={cn(
        // `transition-[…]` et non `transition` : ce dernier anime aussi `transform`, que dnd-kit écrit
        // à chaque mouvement du pointeur — la carte suivait le doigt avec retard.
        'group cursor-grab rounded-lg border border-muted bg-card p-3 text-left shadow-sm transition-[border-color,box-shadow] duration-150 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing',
        (isDragging || localDragging) && 'opacity-60',
      )}
      data-testid="pipeline-card"
      data-customer-id={customer.id}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary"
        >
          {initialsOf(customer)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {nom}
          </p>
          {addedByName ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              <span className="opacity-70">{t('addedBy')}</span> {addedByName}
            </p>
          ) : null}
          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1 tabular-nums">
              <Calendar className="size-3.5" aria-hidden />
              {formatDate(customer.updated_at ?? customer.created_at, locale)}
            </span>
            {(customer.tasks_count ?? 0) > 0 ? (
              <span
                className="flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 tabular-nums text-warning"
                title={t('openTasks')}
              >
                <ListTodo className="size-3.5" aria-hidden />
                {customer.tasks_count}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      {onStageChange ? (
        // `pointerdown` arrêté : sinon le capteur de pointeur de la carte le prend pour un début de
        // glisser, et le sélecteur ne s'ouvre pas.
        <div className="mt-2 flex flex-wrap items-center gap-2" onPointerDown={stop} onClick={stop} onKeyDown={stop}>
          <Select
            value={customer.pipeline_stage}
            onValueChange={(next) => {
              if (next !== null) onStageChange(customer, next as CustomerPipelineStage);
            }}
            items={optionsEtape}
          >
            <SelectTrigger className="flex-1" aria-label={tCrm('stageSelect', { name: nom })}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {optionsEtape.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ContactGestures
            compact
            phone={customer.phone}
            firstName={customer.first_name}
            fullName={nom}
          />
        </div>
      ) : null}
    </div>
  );
}
