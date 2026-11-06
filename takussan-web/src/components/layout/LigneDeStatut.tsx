'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { FOCUS_RING_RENTRANT } from './styles-de-la-barre';

export interface LigneDeStatutProps {
  readonly href: string;
  readonly icone: LucideIcon;
  /** La couleur de l'icône : un jeton sémantique (`text-primary`, `text-warning`). */
  readonly tonIcone: string;
  readonly titre: string;
  readonly texte: string;
  /** La barre est réduite MAINTENANT : le titre passe en infobulle. */
  readonly infobulle?: boolean;
  readonly onNavigate?: () => void;
  readonly slot?: string;
}

/**
 * TCK-2490 (ADR-0090 §6) — une ligne de statut, au pied de la colonne, au-dessus du compte : une icône,
 * un titre, une ligne de précision. Elle remplace les cartes de 200 px (« Demande en cours », mise en
 * location, offre) que le porteur jugeait trop lourdes : même lien, même sens, deux lignes.
 *
 * Le nom accessible est le texte visible (titre puis précision). Barre réduite : l'icône seule, le
 * texte reste lu (`sr-only`), le titre en infobulle.
 */
export function LigneDeStatut({
  href,
  icone: Icone,
  tonIcone,
  titre,
  texte,
  infobulle = false,
  onNavigate,
  slot,
}: LigneDeStatutProps) {
  return (
    <Tooltip disabled={!infobulle}>
      <TooltipTrigger
        render={
          <Link
            href={href}
            onClick={onNavigate}
            data-slot={slot}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors hover:bg-foreground/5 icones:justify-center icones:px-0',
              FOCUS_RING_RENTRANT,
            )}
          />
        }
      >
        <Icone className={cn('size-4 shrink-0', tonIcone)} strokeWidth={1.75} aria-hidden />
        <span className="min-w-0 flex-1 leading-tight icones:sr-only">
          <span className="block truncate font-medium text-foreground">{titre}</span>
          <span className="block truncate text-muted-foreground">{texte}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="right">{titre}</TooltipContent>
    </Tooltip>
  );
}
