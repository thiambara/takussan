import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { ImageIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { PropertyDetail } from '@/types/property';

/**
 * TCK-2639 — les photos de la fiche (maquette `app-biens` a-2). Rendu serveur (composant sans état,
 * sans directive) : la hauteur est fixée par la classe, rien ne la décale à l'hydratation.
 *  · `bandeau` (téléphone) : la photo principale sur 200 px, bord à bord, et « 1 / n » ;
 *  · `grille` (dès `md`) : la principale à gauche (2/3), deux suivantes empilées, « n photos » ; 260 px
 *    à 1440 (72 pas de l'échelle ×0,9, ADR-0107).
 * Sans photo, rien : la fiche ne réserve pas de cadre vide.
 */
export function PhotosDuBien({ property, forme, className }: { readonly property: PropertyDetail; readonly forme: 'bandeau' | 'grille'; readonly className?: string }) {
  const t = useTranslations('propertyDashboard.fiche.photos');
  const photos = property.photos ?? [];
  const principale = photos[0]?.preview ?? property.main_photo_url ?? null;
  if (!principale) return null;
  const n = Math.max(photos.length, 1);

  if (forme === 'bandeau') {
    return (
      <div className={cn('relative h-50 overflow-hidden bg-muted', className)} data-slot="bandeau-photo">
        <Image src={principale} alt={property.title} fill sizes="100vw" className="object-cover" priority />
        <span className="absolute bottom-3 right-3 inline-flex h-7 items-center gap-1.5 rounded-full bg-card px-2.5 text-xs font-medium tabular-nums">
          <ImageIcon className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          {t('position', { n })}
        </span>
      </div>
    );
  }

  const suivantes = photos.slice(1, 3).map((p) => p.preview);
  return (
    <div
      className={cn('grid h-[calc(var(--spacing)*72)] gap-2 overflow-hidden rounded-xl', suivantes.length > 0 ? 'grid-cols-[2fr_1fr]' : 'grid-cols-1', className)}
      data-slot="grille-photo"
    >
      <div className="relative min-h-0 bg-muted">
        <Image src={principale} alt={property.title} fill sizes="(min-width: 80rem) 45vw, 60vw" className="object-cover" priority />
      </div>
      {suivantes.length > 0 ? (
        <div className="flex min-h-0 flex-col gap-2">
          {suivantes.map((src, i) => (
            <div key={src} className="relative min-h-0 flex-1 bg-muted">
              <Image src={src} alt="" fill sizes="20vw" className="object-cover" />
              {i === suivantes.length - 1 ? (
                <span className="absolute bottom-2 right-2 inline-flex h-7 items-center gap-1.5 rounded-full bg-card px-2.5 text-xs font-medium">
                  <ImageIcon className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                  {t('nombre', { count: n })}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
