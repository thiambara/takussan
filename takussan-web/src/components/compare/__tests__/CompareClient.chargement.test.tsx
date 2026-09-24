import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';

import { CompareClient } from '../CompareClient';
import messages from '@/messages/fr.json';
import type { PropertyDetail } from '@/types/property';
import { affichage, cibleTactile, decalage, nonVu } from './boite-compilee';
import { makeProperty } from './bien-de-test';

/**
 * TCK-577, vérification adverse — l'ATTENTE du comparatif mobile.
 *
 * Elle posait une grille en `repeat(n, minmax(200px, 1fr))` à photos 4:3, bureau comme téléphone :
 * relevé au navigateur le 2026-09-24 (requête retenue par CDP), `/fr/compare` à quatre biens
 * élargissait la page à 864 px à 320, 360 et 390, et à 880 px pour 768 à 768 ; puis l'en-tête
 * compact arrivait et le premier critère sautait. Ce fichier garde les deux causes : aucune colonne
 * à largeur minimale, et, sous `md`, les hauteurs de l'en-tête réel.
 *
 * Reprise du 2026-09-24 : il comparait des CLASSES une à une (`h-`, `min-h-`, `mt-`, `py-`) et ne
 * lisait ni la marge des critères ni l'affichage par largeur — `mt-8` au lieu de `mt-3` dans
 * l'attente (le premier critère remonte de 20 px à l'arrivée) et `grid gap-4` au lieu de
 * `hidden gap-4 md:grid` (le squelette de bureau sous le mobile) le laissaient vert. Il compare
 * désormais la POSITION calculée du premier critère, attente contre comparatif chargé, dans la
 * même page, et l'affichage de chaque bloc de part et d'autre de `md` (`boite-compilee.ts`).
 *
 * Seconde reprise : l'affichage ne lisait que le bloc lui-même — `hidden` sur l'enveloppe
 * `aria-busy` (aucun squelette du tout) ou sur celle du comparatif chargé (la comparaison mobile
 * jamais montrée) laissaient 13/13 verts, la position étant calculée sous un ancêtre invisible.
 * `affichage()` lit maintenant toute la chaîne d'ancêtres, et `decalage()` LÈVE sur une cible
 * non affichée.
 */

vi.mock('next/navigation', () => ({
  usePathname: () => '/fr/compare',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('ids=11,12,13,14'),
}));
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));
vi.mock('next/image', () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element -- doublure de `next/image` dans un test.
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));
// Le chrome du site n'est pas l'objet de ce fichier.
vi.mock('@/components/home/Navbar', () => ({ Navbar: () => null }));
vi.mock('@/components/home/NavbarSpacer', () => ({ NavbarSpacer: () => null }));
vi.mock('@/components/home/Footer', () => ({ Footer: () => null }));
// Par défaut, la requête du comparatif ne répond jamais : l'attente reste affichée. `reponse`
// permet de rendre la même page une fois la réponse arrivée, avec les quatre biens de l'URL.
const reponse = vi.hoisted(() => ({ properties: null as PropertyDetail[] | null, loading: true }));
vi.mock('@/hooks/useCompare', () => ({
  useCompare: () => ({ ...reponse, error: null, requestedIds: null, returnedIds: null }),
}));

/** Le 1ᵉʳ critère sous l'en-tête de page, attente puis comparatif chargé, à une largeur. */
async function premierCritere(largeur: number): Promise<{ attente: number; arrivee: number }> {
  Object.assign(reponse, { properties: null, loading: true });
  render(wrap(<CompareClient />));
  const squelette = screen.getByTestId('compare-chargement-mobile');
  const critereAttendu = squelette.lastElementChild!.firstElementChild!;
  const attente = await decalage(document.querySelector('main')!, critereAttendu, largeur, document.querySelector('main > header'));
  cleanup();

  Object.assign(reponse, {
    properties: [11, 12, 13, 14].map((id) => makeProperty({ id, slug: `bien-${id}`, title: `Bien ${id}` })),
    loading: false,
  });
  render(wrap(<CompareClient />));
  const critere = document.querySelector('section[data-divergent]')!;
  const arrivee = await decalage(document.querySelector('main')!, critere, largeur, document.querySelector('main > header'));
  cleanup();
  return { attente, arrivee };
}

afterEach(() => {
  Object.assign(reponse, { properties: null, loading: true });
});

function wrap(ui: React.ReactElement) {
  return (
    <NextIntlClientProvider locale="fr" messages={messages} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>
  );
}

describe('<CompareClient> — l’attente a la forme du comparatif (TCK-577)', () => {
  it('aucune colonne n’exige de largeur minimale : quatre biens tiennent dans la largeur', () => {
    const { container } = render(wrap(<CompareClient />));
    const grilles = [...container.querySelectorAll<HTMLElement>('[style]')].filter(
      (el) => el.style.gridTemplateColumns,
    );
    expect(grilles.length).toBeGreaterThan(0);
    for (const g of grilles) {
      expect(g.style.gridTemplateColumns).toBe('repeat(4, minmax(0, 1fr))');
    }
  });

  it('sous md, le premier critère ne saute pas à l’arrivée : même position dans l’attente et dans le comparatif', async () => {
    render(wrap(<CompareClient />));
    const attente = screen.getByTestId('compare-chargement-mobile');
    // Pas de photo proportionnelle à la largeur dans l'attente mobile.
    expect(attente.querySelectorAll('[class*="aspect-"]')).toHaveLength(0);
    const [vignettes, titres] = [...attente.children] as HTMLElement[];
    expect(vignettes.children).toHaveLength(4);
    expect(titres.children).toHaveLength(4);
    cleanup();

    for (const largeur of [320, 767]) {
      const { attente: y, arrivee } = await premierCritere(largeur);
      expect(y, `à ${largeur} px : le premier critère de l’attente doit être là où le vrai arrive`).toBe(arrivee);
      expect(arrivee, `à ${largeur} px : position du premier critère sous l’en-tête de page`).toBe(129);
    }
  });

  /**
   * La cible de 44 px des boutons « Retirer » (`CompareCarousel.test.tsx`) se juge aussi DANS LA
   * PAGE : un `overflow-hidden` posé par la page autour du comparateur mobile la rognerait tout
   * autant, et le test du composant seul ne le verrait pas.
   */
  it('dans la page, sous md, aucun ancêtre ne rogne la cible des boutons « Retirer »', async () => {
    Object.assign(reponse, {
      properties: [11, 12, 13, 14].map((id) => makeProperty({ id, slug: `bien-${id}`, title: `Bien ${id}` })),
      loading: false,
    });
    render(wrap(<CompareClient />));
    const boutons = within(screen.getByTestId('compare-vignettes')).getAllByRole('button');
    expect(boutons).toHaveLength(4);
    for (const largeur of [320, 767]) {
      for (const bouton of boutons) {
        const cible = await cibleTactile(bouton, largeur);
        const ou = `${bouton.getAttribute('aria-label')} à ${largeur} px`;
        expect(cible.exclusions, ou).toEqual([]);
        expect(Math.min(cible.largeur, cible.hauteur), ou).toBeGreaterThanOrEqual(44);
        expect(cible.rognePar, ou).toEqual([]);
      }
    }
  });

  it('le squelette de bureau n’existe pas sous md, le squelette mobile pas au-dessus', async () => {
    render(wrap(<CompareClient />));
    const mobile = screen.getByTestId('compare-chargement-mobile');
    const bureau = screen.getByTestId('compare-chargement-bureau');
    for (const largeur of [320, 767]) {
      expect(await affichage(bureau, largeur), `bureau à ${largeur} px`).toBe('none');
      // VU, pas seulement « display ≠ none » : un ancêtre `hidden`, un `invisible` ou un
      // `opacity-0` laissaient ce test vert avec un écran vide pendant l'attente.
      expect(await nonVu(mobile, largeur), `mobile à ${largeur} px`).toBeNull();
    }
    for (const largeur of [768, 1366]) {
      expect(await affichage(bureau, largeur), `bureau à ${largeur} px`).toBe('grid');
      expect(await affichage(mobile, largeur), `mobile à ${largeur} px`).toBe('none');
    }
  });
});
