'use client';

import { useId } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { LigneAujourdhui } from '@/lib/navigation/a-traiter';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { compteAffiche } from './compte-affiche';
import type { EntreeRendue } from './useMenuDeLEspace';
import {
  FOCUS_RING_RENTRANT,
  ICONE_DE_LIGNE,
  STYLE_LIGNE,
  STYLE_LIGNE_REPOS,
  STYLE_TITRE,
  TRAIT_D_ICONE,
} from './styles-de-la-barre';

interface AujourdhuiDeLaBarreProps {
  /** `lignesAujourdhui(entrees, compteurs, menu.priorites)` : déjà jugées, dans l'ordre du persona. */
  readonly lignes: readonly LigneAujourdhui[];
  /** Les entrées rendues : l'icône d'une ligne est celle de l'entrée qui porte son compteur. */
  readonly entrees: readonly EntreeRendue[];
  readonly onNavigate?: () => void;
  /** La barre est réduite MAINTENANT (`useIconesEffectives`) : chaque ligne a son infobulle. */
  readonly infobulle?: boolean;
}

/**
 * TCK-2490 (ADR-0090 §3) — « Aujourd'hui » : ce qui attend une réponse, en lignes libellées par l'action
 * (« Messages non lus 21 »), et non plus en pastilles (« 21 messages ») — le bloc « Aujourd'hui » de la
 * maquette « Carnet », validé par le porteur le 2026-11-06.
 *
 * - Les lignes viennent de `lignesAujourdhui` (TCK-2489) : seules les non nulles, dans l'ordre de
 *   `priorites` ; rien du tout (pas même un titre) quand tout est à zéro.
 * - La plus prioritaire porte son compte en puce PRIMAIRE ; les autres en puce neutre. C'est la seule
 *   hiérarchie du bloc : il ne crie pas.
 * - HORS du menu (`data-slot="menu"`) : le menu ne bouge jamais selon un compteur, et ces lignes n'en
 *   sont pas des entrées. Dans le repère de navigation de la colonne, qui porte tous ses liens (suite de
 *   la revue adverse, a).
 * - Revue adverse (I1) — dans le rail, le bloc RESTE : chaque ligne devient son icône, marquée d'un point
 *   de couleur (ADR-0090 §7), et son infobulle dit libellé et nombre (« Visites à confirmer · 17 »).
 *   Caché, il laissait sans signal ce qui attendait dans un groupe replié : le point de l'entrée comptée
 *   vivait dans une liste `inert` de hauteur nulle. Le titre et le nombre restent LUS (`sr-only`).
 * - Le nom accessible est le texte visible, libellé puis nombre (WCAG 2.5.3).
 */
export function AujourdhuiDeLaBarre({ lignes, entrees, onNavigate, infobulle = false }: AujourdhuiDeLaBarreProps) {
  const t = useTranslations('nav.sidebar.aujourdhui');
  const idTitre = useId();
  if (lignes.length === 0) return null;

  return (
    <section
      aria-labelledby={idTitre}
      data-slot="aujourdhui"
      // Rail : un filet le sépare du menu, comme entre deux groupes.
      className="mb-5 icones:mb-2 icones:border-b icones:border-border/60 icones:pb-2"
    >
      <p id={idTitre} className={cn('mb-0.5 flex h-7 items-center px-2.5 icones:sr-only', STYLE_TITRE)}>
        {t('titre')}
      </p>
      <ul className="space-y-px">
        {lignes.map((ligne, rang) => {
          const Icone = entrees.find((e) => e.counterKey === ligne.cle)?.icon;
          const libelle = t(`lignes.${ligne.cle}`);
          return (
            <li key={ligne.cle}>
              <Tooltip disabled={!infobulle}>
                <TooltipTrigger
                  render={
                    <Link
                      href={ligne.href}
                      onClick={onNavigate}
                      // `relative` : le point du rail se pose sur l'icône.
                      className={cn('relative', STYLE_LIGNE, STYLE_LIGNE_REPOS, FOCUS_RING_RENTRANT, 'transition-colors')}
                    />
                  }
                >
                  {Icone ? <Icone className={ICONE_DE_LIGNE} strokeWidth={TRAIT_D_ICONE} aria-hidden /> : null}
                  <span
                    aria-hidden
                    data-slot="point-aujourdhui"
                    className="absolute right-2.5 top-2 hidden size-1.5 rounded-full bg-primary icones:block"
                  />
                  <span className="min-w-0 flex-1 truncate icones:sr-only">{libelle}</span>
                  {/* Un séparateur LU : sans lui, le nom accessible collait le libellé au nombre. */}
                  <span className="sr-only">, </span>
                  <span
                    data-slot="compte-aujourdhui"
                    className={cn(
                      // Rail : le nombre quitte l'œil (le point et l'infobulle le portent), il reste lu.
                      'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md px-1.5 text-[11.5px] font-semibold tabular-nums icones:sr-only',
                      rang === 0 ? 'bg-primary text-primary-foreground' : 'bg-foreground/7 text-foreground',
                    )}
                  >
                    {/* M1 — plafonné comme le menu ; plafonné, le vrai compte reste lu. */}
                    {compteAffiche(ligne.nombre) === String(ligne.nombre) ? (
                      ligne.nombre
                    ) : (
                      <>
                        <span aria-hidden>{compteAffiche(ligne.nombre)}</span>
                        <span className="sr-only">{ligne.nombre}</span>
                      </>
                    )}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {t('infobulle', { libelle, nombre: compteAffiche(ligne.nombre) })}
                </TooltipContent>
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
