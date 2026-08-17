'use client';

import { Flag, Star } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import type { ModerationReview } from '@/lib/queries/reviews-moderation';

interface ModerationQueueListProps {
  readonly reviews: ModerationReview[];
  readonly selectedId: number | null;
  readonly onSelect: (review: ModerationReview) => void;
}

const STATUTS_CONNUS = new Set(['pending', 'reported', 'approved', 'rejected']);

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  reported: 'bg-red-50 text-red-700 border-red-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-stone-50 text-stone-700 border-stone-200',
};

export function ModerationQueueList({
  reviews,
  selectedId,
  onSelect,
}: ModerationQueueListProps) {
  const t = useTranslations('admin.moderation');
  const locale = useLocale();
  return (
    <ul className="max-h-[70vh] overflow-y-auto rounded-xl bg-app-surface-1">
      {reviews.map((review) => {
        const isSelected = review.id === selectedId;
        const status = review.status ?? 'pending';
        return (
          <li key={review.id} data-testid={`moderation-queue-item-${review.id}`}>
            <button
              type="button"
              onClick={() => onSelect(review)}
              className={cn(
                'flex w-full flex-col gap-2 border-b border-app-surface-2 p-4 text-left text-sm transition-colors',
                isSelected
                  ? 'bg-app-surface-2/60'
                  : 'hover:bg-app-surface-2/40',
              )}
              aria-pressed={isSelected}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                    STATUS_CLASS[status] ?? 'bg-app-surface-2 text-app-ink border-app-surface-3',
                  )}
                >
                  {STATUTS_CONNUS.has(status) ? t(`status.${status}`) : status}
                </span>
                {review.reported_count > 0 ? (
                  <span className="inline-flex items-center gap-1 text-xs text-red-600">
                    <Flag className="size-3" />
                    {review.reported_count}
                  </span>
                ) : null}
                <div className="ml-auto flex items-center gap-1 text-xs text-app-ink-muted">
                  <Star className="size-3" />
                  {review.rating}/5
                </div>
              </div>
              <p className="line-clamp-2 text-sm font-medium text-app-ink">
                {review.title || review.content || t('emptyReview')}
              </p>
              <div className="flex items-center justify-between text-xs text-app-ink-muted">
                <span className="truncate">{review.author?.name ?? 'Anonyme'}</span>
                <span>{new Date(review.created_at).toLocaleDateString(locale)}</span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
