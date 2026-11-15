import Image from 'next/image';

import { cn } from '@/lib/utils';
import { BogolanPattern } from '@/components/property/cards/BogolanPattern';

export interface CouvertureDeFicheProps {
  /** `cover` de l'API (TCK-2518) : trois photos au plus, tirées des biens de l'agence. */
  readonly photos: readonly { readonly property_id: number; readonly photo_url: string }[];
  readonly className?: string;
}

/**
 * TCK-2522 — la couverture plein cadre d'une fiche d'agence, **composée de trois de ses biens**
 * (écart de charte accepté, décision 2a du porteur du 2026-11-09 : `docs/design-guidelines.md`,
 * « Couverture d'une fiche d'agence »). Aucune photo à réclamer à l'agence : l'API la tire de sa
 * sélection, puis de ses biens les plus récents.
 *
 * Décorative (`alt=""`) : chaque photo est celle d'un bien que la page présente plus bas avec son
 * titre. Sans aucune photo servable, la couverture garde sa hauteur sur le motif bogolan — la
 * fiche ne change pas de forme, et aucun bloc vide n'apparaît.
 */
export function CouvertureDeFiche({ photos, className }: CouvertureDeFicheProps) {
  const trois = photos.slice(0, 3);
  return (
    <div
      data-couverture={trois.length}
      className={cn(
        'relative grid h-[168px] gap-0.5 overflow-hidden bg-card sm:h-[220px] lg:h-[260px] lg:rounded-b-3xl',
        trois.length === 2 && 'grid-cols-2',
        trois.length === 3 && 'grid-cols-[2fr_1fr] grid-rows-2',
        className,
      )}
    >
      {trois.length === 0 ? (
        <div className="absolute inset-0 text-foreground opacity-[0.05]" aria-hidden>
          <BogolanPattern className="h-full w-full" color="currentColor" />
        </div>
      ) : (
        trois.map((photo, i) => (
          <div key={photo.property_id} className={cn('relative bg-muted', trois.length === 3 && i === 0 && 'row-span-2')}>
            <Image
              src={photo.photo_url}
              alt=""
              fill
              priority={i === 0}
              sizes={trois.length === 1 ? '100vw' : i === 0 ? '(min-width: 1024px) 66vw, 66vw' : '(min-width: 1024px) 34vw, 34vw'}
              className="object-cover"
            />
          </div>
        ))
      )}
    </div>
  );
}
