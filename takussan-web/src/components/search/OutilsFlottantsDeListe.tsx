'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { List, Map as MapIcon, SlidersHorizontal } from 'lucide-react';
import { useFloatingDockSlot } from '@/components/floating-dock';
import { useMatchesMaxWidth } from '@/hooks/useMatchesMedia';
import { cn } from '@/lib/utils';

/** Le seuil `lg` de Tailwind : la pastille n'existe qu'en dessous, comme la rangée mobile. */
const LG_BREAKPOINT_PX = 1024;

/**
 * Hauteur déclarée au dock, en px. ⚠ Le dock ne mesure AUCUN DOM (TCK-275) : ce nombre est ce
 * qu'il croira. La pastille fait `h-12` (48 px), bordure comprise — relevé au navigateur dans les
 * notes de TCK-552.
 */
export const HAUTEUR_OUTILS_FLOTTANTS_PX = 48;

export interface OutilsFlottantsDeListeProps {
  /** Vrai quand la rangée d'outils de la page est sortie de l'écran par le haut. */
  readonly visible: boolean;
  readonly activeCount: number;
  readonly vue: 'list' | 'map';
  readonly onOuvrirFiltres: () => void;
  readonly onBasculerVue: () => void;
}

/**
 * TCK-552 — Filtres et Carte restent à portée du pouce pendant le défilement (P4).
 *
 * À `scrollY = 1500`, seule la `nav` restait fixe : Filtres, tri et carte étaient hors d'atteinte
 * sur une grille de ~4 400 px. Une barre HAUTE collante aurait ajouté ~52 px permanents à une
 * `nav` qui en fait déjà 68 (revue adverse du ticket) : l'accès passe donc par le BAS de l'écran.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI LE DOCK, ET POURQUOI LA PRIORITÉ −1
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Le bas d'écran a UN orchestrateur (TCK-275) : la barre du comparateur (priorité 1) et le bouton
 * de messagerie (priorité 0) s'y empilent. La pastille s'y déclare comme eux — sinon elle se
 * poserait par-dessus la barre du comparateur, ce que l'AC3 interdit.
 *
 * Priorité **−1** : elle se pose AU SOL, et tout le reste se décale au-dessus d'elle. C'est la
 * place du pouce, et c'est l'élément qu'on touche le plus souvent en parcourant une liste ; la
 * barre du comparateur, elle, garde toute sa largeur et reste entièrement visible.
 *
 * `enabled` suit EXACTEMENT ce qui est montré — comme les deux lanceurs de `ChatWidget` : une
 * pastille invisible qui garderait sa place ferait flotter le comparateur 48 px trop haut, au-
 * dessus d'un vide, en haut de page comme sur le bureau.
 */
export function OutilsFlottantsDeListe({
  visible,
  activeCount,
  vue,
  onOuvrirFiltres,
  onBasculerVue,
}: OutilsFlottantsDeListeProps) {
  const tToolbar = useTranslations('search.toolbar');
  const t = useTranslations('property.discovery');
  const sousLg = useMatchesMaxWidth(LG_BREAKPOINT_PX - 1);
  const actif = visible && sousLg;

  const { bottom } = useFloatingDockSlot({
    id: 'liste-outils-flottants',
    corner: 'bottom-right',
    priority: -1,
    height: HAUTEUR_OUTILS_FLOTTANTS_PX,
    enabled: actif,
  });

  if (!actif) return null;

  const bouton =
    'flex h-full items-center gap-2 px-4 text-sm font-semibold transition-[background-color,scale] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:scale-[0.96]';

  return (
    <div
      role="group"
      aria-label={t('outilsFlottantsAria')}
      style={{ bottom }}
      className={cn(
        // Centrée : ni à gauche ni à droite, là où le pouce des deux mains l'atteint.
        'fixed inset-x-0 z-40 mx-auto flex h-12 w-fit items-stretch overflow-hidden rounded-full lg:hidden',
        'border border-border bg-card/95 text-foreground backdrop-blur-md',
        'shadow-[0_1px_2px_color-mix(in_srgb,var(--shadow-color)_6%,transparent),0_12px_32px_color-mix(in_srgb,var(--shadow-color)_14%,transparent)]',
        'animate-compare-dock-in',
      )}
    >
      <button
        type="button"
        onClick={onOuvrirFiltres}
        className={cn(bouton, 'rounded-l-full bg-primary pl-5 text-primary-foreground hover:bg-[var(--primary-deep)]')}
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        {tToolbar('filters')}
        {activeCount > 0 && (
          <span className="grid size-5 place-items-center rounded-full bg-primary-foreground text-xs font-bold tabular-nums text-primary">
            {activeCount}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={onBasculerVue}
        className={cn(bouton, 'rounded-r-full pr-5 hover:bg-muted')}
      >
        {vue === 'list' ? (
          <>
            <MapIcon className="size-4" aria-hidden />
            {t('viewMap')}
          </>
        ) : (
          <>
            <List className="size-4" aria-hidden />
            {t('viewList')}
          </>
        )}
      </button>
    </div>
  );
}
