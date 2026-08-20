'use client';

import { CSSProperties } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Calendar, ListTodo } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import type { PipelineCustomerCard } from '@/types/pipeline';

interface PipelineCardProps {
  customer: PipelineCustomerCard;
  onSelect: (id: number) => void;
  /** When true, this card is the drag preview ghost. */
  isDragging?: boolean;
}

function initialsOf(card: PipelineCustomerCard): string {
  const first = card.first_name?.[0] ?? '';
  const last = card.last_name?.[0] ?? '';
  return (first + last).toUpperCase() || '?';
}

function formatDate(iso: string | undefined | null): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
      new Date(iso),
    );
  } catch {
    return '';
  }
}

export function PipelineCard({
  customer,
  onSelect,
  isDragging,
}: PipelineCardProps) {
  const t = useTranslations('crm.pipeline.card');
  const { attributes, listeners, setNodeRef, transform, isDragging: localDragging } =
    useDraggable({ id: customer.id, data: { customer } });

  const style: CSSProperties = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : {};

  const addedByName =
    customer.added_by?.full_name
    ?? [customer.added_by?.first_name, customer.added_by?.last_name]
      .filter(Boolean)
      .join(' ');

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      tabIndex={0}
      onClick={() => onSelect(customer.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(customer.id);
        }
      }}
      style={style}
      className={cn(
        'group cursor-grab rounded-lg border border-app-surface-2 bg-app-surface-1 p-3 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/30 active:cursor-grabbing',
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
          <p className="truncate text-sm font-semibold text-app-ink">
            {customer.first_name} {customer.last_name}
          </p>
          {addedByName ? (
            <p className="mt-0.5 truncate text-xs text-app-ink-muted">
              <span className="opacity-70">{t('addedBy')}</span> {addedByName}
            </p>
          ) : null}
          <div className="mt-2 flex items-center gap-3 text-xs text-app-ink-muted">
            <span className="flex items-center gap-1">
              <Calendar className="size-3.5" aria-hidden />
              {formatDate(customer.updated_at ?? customer.created_at)}
            </span>
            {(customer.tasks_count ?? 0) > 0 ? (
              <span
                className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-700 dark:text-amber-300"
                title={t('openTasks')}
              >
                <ListTodo className="size-3.5" aria-hidden />
                {customer.tasks_count}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
