'use client';

import { useId } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { LigneAujourdhui } from '@/lib/navigation/a-traiter';
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
 * - HORS du `<nav>` : le menu ne bouge jamais selon un compteur, et ces lignes n'en sont pas des
 *   entrées. Barre réduite (rail) : le bloc se cache, le point de couleur de l'entrée comptée le relaie
 *   (ADR-0090 §7).
 * - Le nom accessible est le texte visible, libellé puis nombre (WCAG 2.5.3).
 */
export function AujourdhuiDeLaBarre({ lignes, entrees, onNavigate }: AujourdhuiDeLaBarreProps) {
  const t = useTranslations('nav.sidebar.aujourdhui');
  const idTitre = useId();
  if (lignes.length === 0) return null;

  return (
    <section aria-labelledby={idTitre} data-slot="aujourdhui" className="mb-5 icones:hidden">
      <p id={idTitre} className={cn('mb-0.5 flex h-7 items-center px-2.5', STYLE_TITRE)}>
        {t('titre')}
      </p>
      <ul className="space-y-px">
        {lignes.map((ligne, rang) => {
          const Icone = entrees.find((e) => e.counterKey === ligne.cle)?.icon;
          return (
            <li key={ligne.cle}>
              <Link
                href={ligne.href}
                onClick={onNavigate}
                className={cn(STYLE_LIGNE, STYLE_LIGNE_REPOS, FOCUS_RING_RENTRANT, 'transition-colors')}
              >
                {Icone ? <Icone className={ICONE_DE_LIGNE} strokeWidth={TRAIT_D_ICONE} aria-hidden /> : null}
                <span className="min-w-0 flex-1 truncate">{t(`lignes.${ligne.cle}`)}</span>
                {/* Un séparateur LU : sans lui, le nom accessible collait le libellé au nombre. */}
                <span className="sr-only">, </span>
                <span
                  data-slot="compte-aujourdhui"
                  className={cn(
                    'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md px-1.5 text-[11.5px] font-semibold tabular-nums',
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
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
