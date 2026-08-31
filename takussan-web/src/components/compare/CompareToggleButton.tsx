'use client';

import React, { useCallback } from 'react';
import { Check, Scale } from 'lucide-react';

import { useCompareToggle } from '@/components/compare/useCompareToggle';
import type { ComparePreview } from '@/lib/compare';
import { cn } from '@/lib/utils';

/**
 * TCK-082 — "Compare" toggle rendered on every `PropertyCard`.
 *
 * Mirrors the visual language of `<FavoriteButton>` (same size, same
 * backdrop-blur pill shape) so the two actions feel native on the card.
 * Consumes the shared {@link CompareProvider} — does not take any prop
 * besides the target id.
 *
 * L'icône BASCULE (balance → coche) au lieu de changer seulement de couleur : sur une
 * photo, un fond de pastille qui passe de translucide à opaque est le signal le plus
 * fragile qui soit — il dépend du pixel qu'il y a dessous. Les deux icônes restent dans
 * le DOM et se croisent en opacité/échelle/flou, ce qui donne une sortie autant qu'une
 * entrée sans dépendre d'une bibliothèque d'animation (il n'y en a aucune ici).
 */

type Size = 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
};

const ICON_CLASSES: Record<Size, string> = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
};

export interface CompareToggleButtonProps {
  readonly propertyId: number;
  readonly className?: string;
  readonly size?: Size;
  /**
   * Titre / vignette du bien, gardés au clic pour que la barre flottante puisse les
   * afficher sans requête. Facultatif : sans lui la barre retombe sur l'initiale.
   */
  readonly preview?: ComparePreview;
}

export function CompareToggleButton({
  propertyId,
  className,
  size = 'md',
  preview,
}: CompareToggleButtonProps) {
  const { isSelected, onToggle, label } = useCompareToggle(propertyId, preview);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      // La pastille vit DANS le lien de la carte : sans ces deux lignes, comparer
      // navigue vers le bien.
      event.preventDefault();
      event.stopPropagation();
      onToggle();
    },
    [onToggle],
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={isSelected}
      aria-label={label}
      title={label}
      data-compare={isSelected ? 'true' : 'false'}
      className={cn(
        SIZE_CLASSES[size],
        'relative rounded-full backdrop-blur-md flex items-center justify-center',
        'cursor-pointer focus-visible:outline-none',
        'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        'transition-[background-color,color,box-shadow,scale] duration-200 active:scale-[0.96]',
        isSelected
          ? 'bg-card text-primary shadow-md'
          : 'bg-card/20 text-primary-foreground hover:bg-card hover:text-primary',
        className,
      )}
    >
      <IconeCroisee visible={!isSelected}>
        <Scale className={ICON_CLASSES[size]} aria-hidden />
      </IconeCroisee>
      <IconeCroisee visible={isSelected}>
        <Check className={cn(ICON_CLASSES[size], 'stroke-[2.5]')} aria-hidden />
      </IconeCroisee>
    </button>
  );
}

/**
 * Les valeurs (échelle 0,25 → 1, flou 4px → 0, `cubic-bezier(0.2, 0, 0, 1)`) sont celles
 * du guide de finition : elles donnent à un échange d'icône le même poids qu'un ressort
 * sans bounce, sans dépendance.
 */
function IconeCroisee({
  visible,
  children,
}: {
  readonly visible: boolean;
  readonly children: React.ReactNode;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'absolute inset-0 flex items-center justify-center',
        'transition-[opacity,scale,filter] duration-300 ease-[cubic-bezier(0.2,0,0,1)]',
        visible ? 'opacity-100 scale-100 blur-none' : 'opacity-0 scale-[0.25] blur-[4px]',
      )}
    >
      {children}
    </span>
  );
}
