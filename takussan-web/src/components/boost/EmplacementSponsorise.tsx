'use client';

import { useTranslations } from 'next-intl';

import { PropertyCard } from '@/components/property/PropertyCard';
import type { PropertyListItem } from '@/types/property';
import { marquerArriveeSponsorisee } from './arrivee-sponsorisee';

export interface EmplacementsSponsorisesProps {
  readonly biens: readonly PropertyListItem[];
  readonly sizes?: string;
}

/**
 * TCK-633 lot F (ADR-0061 §7) — les emplacements « Sponsorisé » en tête de page, HORS de la grille
 * paginée. Une pastille neutre (pas l'accent : « Sponsorisé » informe, il ne vante pas).
 */
export function EmplacementsSponsorises({ biens, sizes }: EmplacementsSponsorisesProps) {
  const t = useTranslations('search.sponsored');
  if (biens.length === 0) return null;

  return (
    <section aria-label={t('label')} className="mb-8">
      <ul className="grid grid-cols-1 gap-x-4 gap-y-6 md:grid-cols-3">
        {biens.map((bien, i) => (
          <li
            key={bien.id}
            className="flex flex-col gap-2"
            onClickCapture={(event) => {
              if ((event.target as HTMLElement).closest('a')) marquerArriveeSponsorisee(bien.slug);
            }}
          >
            <span className="inline-flex w-fit rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {t('chip')}
            </span>
            <PropertyCard property={bien} index={i} sizes={sizes} />
          </li>
        ))}
      </ul>
    </section>
  );
}
