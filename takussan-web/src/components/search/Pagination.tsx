'use client';

import React, { useEffect, useRef, type MouseEvent } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { filtersToParams } from '@/hooks/useSearch';
import type { SearchFilters } from '@/types/search';
import { cn } from '@/lib/utils';

export interface PaginationProps {
  readonly currentPage: number;
  readonly lastPage: number;
  /** Les filtres COURANTS — chaque lien les porte, `page` réécrite. */
  readonly filters: SearchFilters;
  /**
   * L'`id` de l'élément où la vue doit arriver après un changement de page — le début des
   * résultats. Sans lui, la vue ne bouge pas.
   */
  readonly cibleDuDefilement?: string;
}

type Element =
  | { readonly genre: 'page'; readonly page: number; readonly enMobile: boolean }
  | { readonly genre: 'ellipse'; readonly avant: number; readonly enMobile: boolean; readonly enBureau: boolean };

/** Les pages de la forme de BUREAU : 1, la courante ± 1, la dernière (toutes jusqu'à 7). */
function pagesDeBureau(courante: number, derniere: number): number[] {
  if (derniere <= 7) return Array.from({ length: derniere }, (_, i) => i + 1);
  const pages = [1];
  for (let i = Math.max(2, courante - 1); i <= Math.min(derniere - 1, courante + 1); i++) pages.push(i);
  pages.push(derniere);
  return pages;
}

/**
 * La rangée, pour les DEUX largeurs à la fois — TCK-557 · AC3.
 *
 * Sous `md`, seules restent la première page, la courante et la dernière (`‹ 1 … 5 … 10 ›`) :
 * la forme de bureau rendait 9 éléments au pire cas, 428 px de cibles de 44 pour 328 disponibles
 * à 360. Les pages mobiles sont un SOUS-ENSEMBLE des pages de bureau, ce qui permet de rendre une
 * seule rangée dont chaque élément sait s'il se montre sous `md` — plutôt que deux rangées, qui
 * doubleraient chaque lien dans le HTML servi.
 *
 * Une ellipse se pose devant une page dès que la page précédemment montrée n'est pas sa voisine,
 * et ce calcul est fait séparément pour chaque largeur : la page 4 cachée sous `md`, l'ellipse qui
 * la remplace n'existe QUE sous `md`.
 */
function elements(courante: number, derniere: number): Element[] {
  const mobiles = new Set([1, courante, derniere]);
  const sortie: Element[] = [];
  let precedenteBureau: number | null = null;
  let precedenteMobile: number | null = null;

  for (const page of pagesDeBureau(courante, derniere)) {
    const enMobile = mobiles.has(page);
    const trouBureau = precedenteBureau !== null && page - precedenteBureau > 1;
    const trouMobile = enMobile && precedenteMobile !== null && page - precedenteMobile > 1;
    if (trouBureau || trouMobile) {
      sortie.push({ genre: 'ellipse', avant: page, enMobile: trouMobile, enBureau: trouBureau });
    }
    sortie.push({ genre: 'page', page, enMobile });
    precedenteBureau = page;
    if (enMobile) precedenteMobile = page;
  }
  return sortie;
}

/** Un clic que le navigateur doit garder : nouvel onglet, nouvelle fenêtre, téléchargement. */
function clicModifie(e: MouseEvent<HTMLAnchorElement>): boolean {
  return e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
}

/**
 * La pagination de `/properties` — faite de LIENS depuis TCK-557.
 *
 * Elle rendait des `<button onClick>` : les pages 2 et suivantes n'étaient atteignables par aucun
 * lien. Un robot ne les suivait pas, et un visiteur ne pouvait ni les ouvrir dans un onglet ni en
 * copier l'adresse. TCK-432 avait mis les biens dans le HTML de la première réponse ; la
 * pagination, elle, n'y était toujours pas navigable.
 *
 * ── LE HREF ─────────────────────────────────────────────────────────────────────────────────────
 *
 * Il est écrit par `filtersToParams`, **la fabrique d'URL qu'emploie déjà `search()`** — pas une
 * troisième : les filtres courants dans l'ordre de la table, la géographie normalisée, et `page`
 * omise pour la page 1, soit la même forme que la canonique (`lib/canonique`), qui ne l'écrit
 * jamais.
 *
 * ── LE CLIC ─────────────────────────────────────────────────────────────────────────────────────
 *
 * Un clic simple est intercepté et devient un `router.push` : la navigation reste instantanée,
 * côté client. Un clic modifié (⌘, Ctrl, Maj, bouton du milieu) est laissé au navigateur — c'est
 * tout l'intérêt d'un lien.
 *
 * ── LE DÉFILEMENT ───────────────────────────────────────────────────────────────────────────────
 *
 * La vue arrive au **début des résultats**, et non en haut du document (au-dessus du titre et des
 * contrôles). Il a lieu APRÈS le changement d'URL, pas au clic : défiler au clic produirait un
 * événement de défilement que `useScrollRestoration` (TCK-335) pourrait encore attribuer à
 * l'entrée de la page quittée, dont il écraserait la position.
 */
export function Pagination({ currentPage, lastPage, filters, cibleDuDefilement }: PaginationProps) {
  const t = useTranslations('search.pagination');
  const router = useRouter();
  const pathname = usePathname();
  const cleDeLUrl = useSearchParams().toString();

  /** Posé par un clic de pagination, consommé par le premier changement d'URL qui suit. */
  const defilementEnAttente = useRef(false);

  useEffect(() => {
    if (!defilementEnAttente.current) return;
    defilementEnAttente.current = false;
    if (!cibleDuDefilement) return;
    document.getElementById(cibleDuDefilement)?.scrollIntoView({ block: 'start' });
  }, [cleDeLUrl, cibleDuDefilement]);

  if (lastPage <= 1) return null;

  const hrefDe = (page: number): string => {
    const qs = filtersToParams({ ...filters, page: page > 1 ? page : undefined }).toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const surClic = (page: number) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || clicModifie(e)) return;
    e.preventDefault();
    if (page === currentPage) return;
    defilementEnAttente.current = true;
    router.push(hrefDe(page), { scroll: false });
  };

  const fleche = (page: number, libelle: string, icone: React.ReactNode, actif: boolean) =>
    actif ? (
      <a
        href={hrefDe(page)}
        onClick={surClic(page)}
        aria-label={libelle}
        className="size-11 flex items-center justify-center rounded-full border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
      >
        {icone}
      </a>
    ) : (
      // Aux bornes, pas de lien vers une page qui n'existe pas — la place est gardée pour que la
      // rangée ne saute pas d'une page à l'autre.
      <span
        aria-hidden="true"
        className="size-11 flex items-center justify-center rounded-full border border-border text-muted-foreground opacity-30"
      >
        {icone}
      </span>
    );

  return (
    <nav aria-label={t('aria')} className="mt-12 flex flex-col items-center gap-3">
      <div data-rangee className="flex items-center justify-center gap-1">
        {fleche(currentPage - 1, t('previous'), <ChevronLeft className="size-4" />, currentPage > 1)}

        {elements(currentPage, lastPage).map((el) =>
          el.genre === 'ellipse' ? (
            <span
              key={`ellipse-${el.avant}`}
              aria-hidden="true"
              className={cn(
                'w-6 h-11 items-center justify-center text-muted-foreground text-sm',
                el.enMobile ? 'flex' : 'hidden',
                el.enBureau ? 'md:flex' : 'md:hidden',
              )}
            >
              …
            </span>
          ) : (
            <a
              key={el.page}
              href={hrefDe(el.page)}
              onClick={surClic(el.page)}
              aria-current={el.page === currentPage ? 'page' : undefined}
              className={cn(
                'size-11 flex items-center justify-center rounded-full text-sm font-semibold transition-colors',
                !el.enMobile && 'hidden md:flex',
                el.page === currentPage
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border text-foreground hover:border-primary hover:text-primary',
              )}
            >
              {el.page}
            </a>
          ),
        )}

        {fleche(currentPage + 1, t('next'), <ChevronRight className="size-4" />, currentPage < lastPage)}
      </div>

      <p aria-live="polite" className="text-sm tabular-nums text-muted-foreground">
        {t('position', { page: currentPage, lastPage })}
      </p>
    </nav>
  );
}
