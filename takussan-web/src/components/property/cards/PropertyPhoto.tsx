'use client';

import Image, { type ImageProps } from 'next/image';
import { ImageOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface PropertyPhotoProps extends Omit<ImageProps, 'src' | 'alt' | 'fill'> {
  readonly src: string | null | undefined;
  readonly alt: string;
  /** Vignette trop petite pour un libellé : l'icône seule. */
  readonly compact?: boolean;
}

/**
 * La photo d'un bien, posée en `fill` dans un conteneur `relative` qui fixe le ratio — ou, faute
 * de photo, une surface `bg-muted` avec une icône et « Photo à venir ».
 *
 * Revue design du 2026-09-16 : le repli était une image de placehold.co (800×600, texte incrusté).
 * Recadrée en `object-cover` dans un format 3:4 ou 1:1, son texte débordait la carte (« Photo à
 * veni… » en 64 px sur la rangée Coup de cœur), il restait en français sous `/en` et `/wo`, et la
 * carte dépendait d'un service tiers pour s'afficher. Le repli est désormais rendu ici, en jetons.
 */
export function PropertyPhoto({ src, alt, className, compact = false, ...rest }: PropertyPhotoProps) {
  const t = useTranslations('property.cards');

  if (!src) {
    return (
      <div
        {...(alt ? { role: 'img', 'aria-label': alt } : { 'aria-hidden': true })}
        className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-muted text-muted-foreground"
      >
        <ImageOff className={compact ? 'size-4' : 'size-6'} strokeWidth={1.5} aria-hidden="true" />
        {/* Dans un conteneur `@container` étroit (grille à 2 colonnes à 360 px, image de 156 px),
            le libellé était coupé (« Photo coming soo… ») et heurtait la pastille de date :
            l'icône seule y suffit. Sans conteneur ancêtre, la requête ne s'applique pas. */}
        {!compact && (
          <span className="px-2 text-center text-xs font-medium @max-[12rem]:hidden">
            {t('photoPending')}
          </span>
        )}
      </div>
    );
  }

  return <Image src={src} alt={alt} fill className={cn('object-cover', className)} {...rest} />;
}
