import { Fragment } from 'react';
import { cn } from '@/lib/utils';

interface CardMetaProps {
  /** Les éléments absents (`null`, `false`, chaîne vide) sont écartés AVANT de poser les points. */
  readonly items: readonly (string | null | false | undefined)[];
  readonly className?: string;
}

/**
 * La ligne de méta d'une carte (« 3 ch • 95 m² • 2 sdb »).
 *
 * Chaque variante posait ses séparateurs à la main, collés à un élément : un bien sans chambre
 * rendait « • 143 m² » (point en tête) et un bien sans surface « 3 ch • » (point en queue).
 * Mesuré sur l'accueil le 2026-09-16. Le séparateur ne se pose plus qu'ENTRE deux éléments présents.
 */
export function CardMeta({ items, className }: CardMetaProps) {
  const presents = items.filter((item): item is string => Boolean(item));
  if (presents.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-x-1.5 gap-y-0.5 tabular-nums', className)}>
      {presents.map((item, i) => (
        <Fragment key={`${i}-${item}`}>
          {i > 0 && (
            <span aria-hidden="true" className="text-muted-foreground/50">
              •
            </span>
          )}
          <span>{item}</span>
        </Fragment>
      ))}
    </div>
  );
}
