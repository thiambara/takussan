'use client';

import type * as React from 'react';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import { EMPLACEMENT_BARRE_D_ACTION } from '@/components/ui/barre-d-action';
import { cn } from '@/lib/utils';

import { DeclarerEnTete } from './en-tete-de-la-coque';

const abonner = () => () => {};

/**
 * TCK-2836 — LA BARRE D'UNE SÉLECTION EN COURS, au téléphone : un mécanisme de coque, pas d'écran.
 *
 *  · Tant qu'elle est montée, elle DÉCLARE une sélection (`DeclarerEnTete selection`) : sous `md`, la
 *    coque (`AppShell`) retire la barre d'onglets, et l'emplacement de la barre d'action
 *    (`#emplacement-barre-d-action`) devient le bas de l'écran (`data-bas-de-l-ecran`). Démontée —
 *    sélection vidée, page quittée par un lien ou le retour arrière —, la déclaration tombe avec elle
 *    et la barre d'onglets revient : une déclaration oubliée n'existe pas.
 *  · Elle est rendue EN PORTAIL dans cet emplacement, EN FLUX (TCK-2689) : le `<main>` rétrécit de sa
 *    hauteur, quelle qu'elle soit (une sélection passe sur plusieurs rangées), et le dernier élément de
 *    la liste reste atteignable en défilant. La zone sûre (`env(safe-area-inset-bottom)`) s'ajoute à
 *    son rembourrage bas, puisqu'elle est le bas de l'écran.
 *  · Sa hauteur VARIE (rangées, bilan d'un lot) : elle la publie dans `--barre-d-action-hauteur`, que
 *    lisent `--toast-bas` et `--floating-dock-base` (globals.css) — le toast et ce qui flotte se posent
 *    au-dessus d'elle, jamais dessus. La constante de 69 px de `BarreDAction` ne vaut pas ici.
 *  · Sous `md` seulement (`md:hidden`) : au bureau, l'écran garde sa propre barre (le `FloatingDock`
 *    de `PropertyList`). L'écran choisit laquelle monter (`REQUETE_DE_LA_BARRE`) : une seule existe.
 *  · Hors de la coque (aucun emplacement), elle se rend en flux là où elle est écrite.
 */
interface BarreDeSelectionDeLaCoqueProps extends React.ComponentProps<'div'> {
  /** Le nom de la région (« Actions groupées »). */
  readonly 'aria-label': string;
}

export function BarreDeSelectionDeLaCoque({ className, children, ...props }: BarreDeSelectionDeLaCoqueProps) {
  const hydrate = useSyncExternalStore(abonner, () => true, () => false);
  const emplacement = useSyncExternalStore(
    abonner,
    () => document.getElementById(EMPLACEMENT_BARRE_D_ACTION),
    () => null,
  );
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const barre = ref.current;
    if (!barre || !emplacement) return;
    const racine = document.documentElement;
    const publier = () => racine.style.setProperty('--barre-d-action-hauteur', `${barre.getBoundingClientRect().height}px`);
    publier();
    const observateur = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publier);
    observateur?.observe(barre);
    return () => {
      observateur?.disconnect();
      racine.style.removeProperty('--barre-d-action-hauteur');
    };
  }, [emplacement, hydrate]);

  if (!hydrate) return null;

  const barre = (
    <div
      ref={ref}
      role="region"
      data-slot="barre-de-selection"
      className={cn(
        'flex flex-none flex-wrap items-center gap-2 px-4 pt-3 pb-[calc(var(--spacing)*3+env(safe-area-inset-bottom))] shadow-barre-collante md:hidden',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );

  return (
    <>
      <DeclarerEnTete selection />
      {emplacement ? createPortal(barre, emplacement) : barre}
    </>
  );
}
