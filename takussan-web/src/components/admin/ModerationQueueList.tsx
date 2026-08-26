'use client';

import { Flag, Star } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { StatusBadge, type StatusTone } from '@/components/console';
import { cn } from '@/lib/utils';
import type { ModerationReview } from '@/lib/queries/reviews-moderation';

interface ModerationQueueListProps {
  readonly reviews: ModerationReview[];
  readonly selectedId: number | null;
  readonly onSelect: (review: ModerationReview) => void;
}

const STATUTS_CONNUS = new Set(['pending', 'reported', 'approved', 'rejected']);

/**
 * TCK-373 — le statut porte un TON, plus une paire de classes. `approved` était
 * `bg-emerald-50`, l'une des quatre recettes de « succès » de la console ; aucune n'était le
 * sage de la charte. La couleur se décide dans `StatusBadge`, une fois.
 */
const STATUS_TONES: Record<string, StatusTone> = {
  pending: 'attention',
  reported: 'danger',
  approved: 'success',
  rejected: 'neutral',
};

export function ModerationQueueList({
  reviews,
  selectedId,
  onSelect,
}: ModerationQueueListProps) {
  const t = useTranslations('admin.moderation');
  const locale = useLocale();
  return (
    <ul className="max-h-[70vh] overflow-y-auto rounded-xl bg-card">
      {reviews.map((review) => {
        const isSelected = review.id === selectedId;
        const status = review.status ?? 'pending';
        return (
          <li key={review.id} data-testid={`moderation-queue-item-${review.id}`}>
            <button
              type="button"
              onClick={() => onSelect(review)}
              className={cn(
                'flex w-full flex-col gap-2 border-b border-muted p-4 text-left text-sm transition-colors',
                isSelected
                  ? 'bg-muted/60'
                  : 'hover:bg-muted/40',
              )}
              aria-pressed={isSelected}
            >
              <div className="flex items-center gap-2">
                <StatusBadge
                  tone={STATUS_TONES[status] ?? 'neutral'}
                  className="text-[10px] font-semibold uppercase tracking-wide"
                  label={STATUTS_CONNUS.has(status) ? t(`status.${status}`) : status}
                />
                {review.reported_count > 0 ? (
                  <span className="inline-flex items-center gap-1 text-xs text-destructive">
                    <Flag className="size-3" />
                    {review.reported_count}
                  </span>
                ) : null}
                <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                  <Star className="size-3" />
                  {review.rating}/5
                </div>
              </div>
              <p className="line-clamp-2 text-sm font-medium text-foreground">
                {review.title || review.content || t('emptyReview')}
              </p>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="truncate">{review.author?.name ?? t('detail.anonymous')}</span>
                <span>{new Date(review.created_at).toLocaleDateString(locale)}</span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
