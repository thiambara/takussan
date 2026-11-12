'use client';

import { Building2, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { ModerationProperty } from '@/lib/queries/property-moderation';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';

interface PropertyModerationQueueListProps {
  readonly properties: ModerationProperty[];
  readonly selectedId: number | null;
  readonly onSelect: (property: ModerationProperty) => void;
  /**
   * TCK-2673 — `bande` (bureau) : les biens en attente en une rangée qui défile, au-dessus de
   * l'aperçu du bien ouvert ; `liste` (téléphone) : une ligne par bien, toucher ouvre son aperçu.
   */
  readonly forme?: 'bande' | 'liste';
}

export function PropertyModerationQueueList({ properties, selectedId, onSelect, forme = 'bande' }: PropertyModerationQueueListProps) {
  const t = useTranslations('admin.moderation');
  const tBien = useTranslations('admin.propertyModeration.bien');
  const { jourMois } = useFormatteurs();

  return (
    <ul
      aria-label={tBien('file')}
      className={cn(forme === 'bande' ? 'flex gap-2 overflow-x-auto pb-1' : 'divide-y divide-border border-y border-border bg-card')}
    >
      {properties.map((property) => {
        const isSelected = property.id === selectedId;
        const detail = [property.owner?.name ?? t('unknownAgent'), property.submitted_at ? jourMois(property.submitted_at) : null]
          .filter(Boolean)
          .join(' · ');
        return (
          <li key={property.id} data-testid={`property-queue-item-${property.id}`} className={cn(forme === 'bande' && 'w-64 flex-none')}>
            <button
              type="button"
              onClick={() => onSelect(property)}
              aria-current={isSelected ? 'true' : undefined}
              className={cn(
                'flex w-full items-center gap-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                forme === 'bande'
                  ? cn('rounded-xl border p-2.5', isSelected ? 'border-primary bg-secondary' : 'border-border bg-card hover:bg-muted')
                  : 'min-h-16 px-4 py-3 hover:bg-muted',
              )}
            >
              <span className="flex size-12 flex-none items-center justify-center overflow-hidden rounded-lg bg-muted">
                {property.main_photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- vignette de l'API (`preview`), déjà dimensionnée
                  <img src={property.main_photo_url} alt="" className="size-full object-cover" loading="lazy" />
                ) : (
                  <Building2 className="size-5 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{property.title}</span>
                <span className="block truncate text-ui text-muted-foreground">{detail}</span>
              </span>
              {forme === 'liste' ? <ChevronRight className="size-5 flex-none text-muted-foreground" aria-hidden="true" /> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
