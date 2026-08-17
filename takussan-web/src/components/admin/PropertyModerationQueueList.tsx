'use client';

import { Building2, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ModerationProperty } from '@/lib/queries/property-moderation';
import { useTranslations } from 'next-intl';

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
  return (
    <ul className="max-h-[70vh] overflow-y-auto rounded-xl bg-app-surface-1">
      {properties.map((property) => {
        const isSelected = property.id === selectedId;
        return (
          <li key={property.id}>
            <button
              type="button"
              onClick={() => onSelect(property)}
              className={cn(
                'flex w-full flex-col gap-2 border-b border-app-surface-2 p-4 text-left text-sm transition-colors',
                isSelected ? 'bg-app-surface-2/60' : 'hover:bg-app-surface-2/40',
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
                  <div className="flex size-12 flex-shrink-0 items-center justify-center rounded-lg bg-app-surface-2">
                    <Building2 className="size-5 text-app-ink-muted" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-app-ink">
                    {property.title}
                  </p>
                  <p className="truncate text-xs text-app-ink-muted">
                    {property.reference_number}
                    {property.agency ? ` · ${property.agency.name}` : ''}
                  </p>
                </div>
                <span className="flex-shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                  {t('status.pending')}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-app-ink-muted">
                <span className="flex items-center gap-1">
                  <Building2 className="size-3" />
                  {property.owner?.name ?? t('unknownAgent')}
                </span>
                {property.submitted_at ? (
                  <span className="ml-auto flex items-center gap-1">
                    <Calendar className="size-3" />
                    {new Date(property.submitted_at).toLocaleDateString('fr-FR')}
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
