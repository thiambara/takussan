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
  /**
   * `'sombre'` : l'attente se dessine à l'encre — pour une carte qui pose un texte blanc sur un
   * dégradé (`PropertyCardCover`). Sur l'attente claire, ce dégradé virait au gris sale sur du
   * beige : la rangée « Coup de cœur » paraissait terne tant que ses biens n'avaient pas de photo
   * (revue de l'accueil du 2026-09-28). L'encre est à 92 % sur le beige du cadre (`bg-muted`) :
   * à 100 %, la plaque « En vente » (`bg-foreground/85`) s'y fondait et perdait son contour ; un
   * mélange arbitraire (`color-mix`, dégradé) l'aurait rendue, mais la garde de contraste de la
   * surface publique ne lit un fond que par son jeton. En thème sombre, `--foreground` est clair :
   * la surface passe alors sur `--muted`, qui y est sombre.
   */
  readonly ton?: 'clair' | 'sombre';
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
export function PropertyPhoto({ src, alt, className, compact = false, ton = 'clair', ...rest }: PropertyPhotoProps) {
  const t = useTranslations('property.cards');

  if (!src) {
    return (
      <div
        {...(alt ? { role: 'img', 'aria-label': alt } : { 'aria-hidden': true })}
        className={cn(
          'absolute inset-0 flex flex-col items-center justify-center gap-1.5',
          ton === 'sombre'
            ? 'bg-foreground/92 text-background/60 dark:bg-muted dark:text-muted-foreground'
            : 'bg-muted text-muted-foreground',
        )}
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

  // Un filet noir à 10 %, À L'INTÉRIEUR de l'image : il donne un bord net aux photos claires
  // (ciel, murs blancs) sur le fond Lin. Sur `--shadow-color`, l'encre qui ne s'inverse pas —
  // `--scrim` (noir pur) est réservé aux fonds par `check-public-chrome-tokens` (contrôle C).
  return (
    <Image
      src={src}
      alt={alt}
      fill
      className={cn('object-cover outline outline-1 -outline-offset-1 outline-[color-mix(in_srgb,var(--shadow-color)_10%,transparent)]', className)}
      {...rest}
    />
  );
}
