'use client';

import React, { useCallback } from 'react';
import { Scale } from 'lucide-react';

import { COMPARE_MAX_IDS } from '@/lib/compare';
import { useCompare } from '@/context/CompareContext';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

/**
 * TCK-082 — "Compare" toggle rendered on every `PropertyCard`.
 *
 * Mirrors the visual language of `<FavoriteButton>` (same size, same
 * backdrop-blur pill shape) so the two actions feel native on the card.
 * Consumes the shared {@link CompareProvider} — does not take any prop
 * besides the target id.
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
}

export function CompareToggleButton({
  propertyId,
  className,
  size = 'md',
}: CompareToggleButtonProps) {
  const { has, toggle, ids } = useCompare();
  const toast = useToast();

  const isSelected = has(propertyId);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const result = toggle(propertyId);

      if (result.status === 'rejected') {
        toast.add({
          title: `Maximum ${COMPARE_MAX_IDS} biens`,
          description: 'Retirez un bien pour en ajouter un autre.',
          type: 'warning',
        });
        return;
      }

      if (result.status === 'added') {
        toast.add({
          title: 'Ajouté au comparateur',
          description: `${ids.length + 1} / ${COMPARE_MAX_IDS} biens sélectionnés.`,
          type: 'info',
        });
      }
    },
    [toggle, propertyId, toast, ids.length],
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={isSelected}
      aria-label={isSelected ? 'Retirer du comparateur' : 'Ajouter au comparateur'}
      data-compare={isSelected ? 'true' : 'false'}
      className={cn(
        SIZE_CLASSES[size],
        'rounded-full backdrop-blur-md flex items-center justify-center',
        'transition-all duration-200 cursor-pointer focus-visible:outline-none',
        'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        isSelected
          ? 'bg-white text-primary shadow-md'
          : 'bg-white/20 text-white hover:bg-white hover:text-primary',
        className,
      )}
    >
      <Scale
        className={cn(
          ICON_CLASSES[size],
          'transition-transform',
          isSelected && 'scale-110',
        )}
      />
    </button>
  );
}
