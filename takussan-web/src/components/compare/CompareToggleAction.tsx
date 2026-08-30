'use client';

import React from 'react';
import { Check, Scale } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { useCompareToggle } from '@/components/compare/useCompareToggle';
import type { ComparePreview } from '@/lib/compare';
import { cn } from '@/lib/utils';

/**
 * Le point d'entrée du comparateur SUR LA FICHE D'UN BIEN.
 *
 * La pastille des cartes (`CompareToggleButton`) ne convient pas ici : elle se pose sur une
 * photo, ne porte aucun libellé, et la fiche n'a pas de photo sur laquelle la poser — son
 * en-tête est une rangée d'actions libellées (Partager, Favori). Celle-ci prend donc la même
 * forme qu'elles, et passe par le même hook que la pastille pour que le plafond, le toast
 * de rejet et le nom accessible restent uniques.
 *
 * ⚠ Le libellé écrit à l'écran est COURT (« Comparer » / « Comparé ») là où le nom
 * accessible est complet (« Ajouter au comparateur ») : la rangée d'actions est étroite sur
 * mobile, et un lecteur d'écran n'a pas de raison de payer cette contrainte-là.
 */
export interface CompareToggleActionProps {
  readonly propertyId: number;
  readonly preview?: ComparePreview;
  readonly className?: string;
}

export function CompareToggleAction({
  propertyId,
  preview,
  className,
}: CompareToggleActionProps) {
  const t = useTranslations('compare.button');
  const { isSelected, onToggle, label } = useCompareToggle(propertyId, preview);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={isSelected}
      title={label}
      data-compare={isSelected ? 'true' : 'false'}
      className={cn('gap-2 transition-[color,background-color,scale] active:scale-[0.96]', className)}
    >
      <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
        <IconeCroisee visible={!isSelected}>
          <Scale className="size-4" aria-hidden />
        </IconeCroisee>
        <IconeCroisee visible={isSelected}>
          <Check className="size-4 stroke-[2.5] text-primary" aria-hidden />
        </IconeCroisee>
      </span>
      <span className="hidden sm:inline">{t(isSelected ? 'shortRemove' : 'shortAdd')}</span>
    </Button>
  );
}

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
