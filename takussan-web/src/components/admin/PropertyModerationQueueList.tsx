'use client';

import { Building2, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ModerationProperty } from '@/lib/queries/property-moderation';
import { useLocale, useTranslations } from 'next-intl';

import { StatusBadge } from '@/components/console';
import { formatDate } from '@/lib/format';
import type { Locale } from '@/i18n/config';

interface PropertyModerationQueueListProps {
  readonly properties: ModerationProperty[];
  readonly selectedId: number | null;
  readonly onSelect: (property: ModerationProperty) => void;
}

export function PropertyModerationQueueList({
  properties,
  selectedId,
  onSelect,
}: PropertyModerationQueueListProps) {
  const t = useTranslations('admin.moderation');
  const locale = useLocale() as Locale;
  return (
    <ul className="max-h-[70vh] overflow-y-auto rounded-xl bg-card">
      {properties.map((property) => {
        const isSelected = property.id === selectedId;
        return (
          <li key={property.id}>
            <button
              type="button"
              onClick={() => onSelect(property)}
              className={cn(
                'flex w-full flex-col gap-2 border-b border-muted p-4 text-left text-sm transition-colors',
                'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                isSelected ? 'bg-muted/60' : 'hover:bg-muted/40',
              )}
              aria-pressed={isSelected}
            >
              <div className="flex items-start gap-3">
                {property.main_photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={property.main_photo_url}
                    alt=""
                    className="size-12 flex-shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex size-12 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Building2 className="size-5 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {property.title}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {property.reference_number}
                    {property.agency ? ` · ${property.agency.name}` : ''}
                  </p>
                </div>
                <StatusBadge
                  tone="attention"
                  className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide"
                  label={t('status.pending')}
                />
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Building2 className="size-3" />
                  {property.owner?.name ?? t('unknownAgent')}
                </span>
                {property.submitted_at ? (
                  <span className="ml-auto flex items-center gap-1">
                    <Calendar className="size-3" />
                    {/* TCK-292 — la locale ACTIVE, plus `fr-FR` en dur. */}
                    {formatDate(property.submitted_at, locale, {
                      dateStyle: undefined,
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                  </span>
                ) : null}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
