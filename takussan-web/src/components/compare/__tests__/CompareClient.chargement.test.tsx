import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';

import { CompareClient } from '../CompareClient';
import { RESERVE_BARRE_PARTAGER } from '../CompareColonnes';
import messages from '@/messages/fr.json';
import type { PropertyDetail } from '@/types/property';
import { affichage, cibleTactile, nonVu } from './boite-compilee';
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
 *
 * TCK-2509 — le comparatif est devenu UNE grille en colonnes alignées pour toutes les largeurs
 * (`CompareColonnes`), et l'attente aussi : plus de squelette mobile et de squelette de bureau.
 * `decalage()` ne sait pas mesurer une grille de plusieurs rangées (essayé : il lève « grille de
 * plusieurs rangées — non modélisé ») ; la position du premier critère n'est donc plus calculée.
 * Ce qui la fixe est comparé : la hauteur DÉCLARÉE de la vignette et de la rangée de la bascule,
 * attente contre comparatif. Les lignes de texte (prix, titre) n'ont pas de hauteur déclarée.
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
vi.mock('@/components/home/Footer', () => ({ Footer: () => <footer data-testid="pied-de-page" /> }));
// Par défaut, la requête du comparatif ne répond jamais : l'attente reste affichée. `reponse`
// permet de rendre la même page une fois la réponse arrivée, avec les quatre biens de l'URL.
const reponse = vi.hoisted(() => ({ properties: null as PropertyDetail[] | null, loading: true }));
vi.mock('@/hooks/useCompare', () => ({
  useCompare: () => ({ ...reponse, error: null, requestedIds: null, returnedIds: null }),
}));
// « Partager » lève un toast : le fournisseur est celui de la coque publique.
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

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

describe('<CompareClient> — l’attente a la forme du comparatif (TCK-577, TCK-2509)', () => {
  it('aucune colonne n’exige de largeur minimale : quatre biens tiennent dans la largeur', () => {
    const { container } = render(wrap(<CompareClient />));
    const attente = screen.getByTestId('compare-chargement');
    expect(attente.style.getPropertyValue('--colonnes-mobile')).toBe('repeat(4, minmax(0, 1fr))');
    expect(attente.style.getPropertyValue('--colonnes-bureau')).toBe('minmax(8rem, 13rem) repeat(4, minmax(0, 1fr))');
    const defilants = [...container.querySelectorAll<HTMLElement>('*')].filter((el) =>
      /(^|\s)(overflow-x-(auto|scroll)|snap-x|min-w-\[|aspect-)/.test(el.className),
    );
    expect(defilants.map((el) => el.className)).toEqual([]);
  });

  /**
   * Le premier critère ne doit pas sauter à l'arrivée : l'en-tête de l'attente a les MÊMES
   * hauteurs que celui du comparatif — la vignette, la rangée de la bascule. Les deux grilles sont
   * comparées classe à classe sur ce qui fixe une hauteur.
   */
  it('l’en-tête de l’attente a les hauteurs du vrai : vignette et rangée de la bascule', () => {
    const hauteurs = (el: Element) => el.className.split(/\s+/).filter((c) => /^(md:|lg:)?(h|min-h)-/.test(c)).sort();

    render(wrap(<CompareClient />));
    const attente = screen.getByTestId('compare-chargement');
    const vignetteAttendue = hauteurs(attente.children[1].children[1].firstElementChild!);
    const basculeAttendue = hauteurs(attente.firstElementChild!);
    cleanup();

    Object.assign(reponse, {
      properties: [11, 12, 13, 14].map((id) => makeProperty({ id, slug: `bien-${id}`, title: `Bien ${id}` })),
      loading: false,
    });
    render(wrap(<CompareClient />));
    const premierBien = within(screen.getByTestId('compare-en-tete')).getAllByRole('columnheader')[1];
    expect(hauteurs(premierBien.querySelector('a')!)).toEqual(vignetteAttendue);
    expect(vignetteAttendue).toEqual(['h-14', 'lg:h-28', 'md:h-24']);
    expect(hauteurs(screen.getByRole('switch'))).toEqual(basculeAttendue);
  });

  /**
   * La cible de 44 px des boutons « Retirer » (`CompareColonnes.test.tsx`) se juge aussi DANS LA
   * PAGE : un `overflow-hidden` posé par la page autour du comparateur la rognerait tout autant,
   * et le test du composant seul ne le verrait pas.
   */
  it('dans la page, aucun ancêtre ne rogne la cible des boutons « Retirer »', async () => {
    Object.assign(reponse, {
      properties: [11, 12, 13, 14].map((id) => makeProperty({ id, slug: `bien-${id}`, title: `Bien ${id}` })),
      loading: false,
    });
    render(wrap(<CompareClient />));
    const boutons = within(screen.getByTestId('compare-en-tete')).getAllByRole('button');
    expect(boutons).toHaveLength(4);
    // Le premier et le dernier au téléphone (le dernier touche le bord droit), le premier au
    // bureau : mêmes ancêtres, même classe. Chaque mesure parcourt toutes les classes compilées
    // de la page et coûte — cinq mesures ont dépassé 30 s sous charge (load 27 sur 8 cœurs).
    const mesures: [number, HTMLElement[]][] = [[320, [boutons[0], boutons[3]]], [1366, [boutons[0]]]];
    for (const [largeur, aMesurer] of mesures) {
      for (const bouton of aMesurer) {
        const cible = await cibleTactile(bouton, largeur);
        const ou = `${bouton.getAttribute('aria-label')} à ${largeur} px`;
        expect(cible.exclusions, ou).toEqual([]);
        expect(Math.min(cible.largeur, cible.hauteur), ou).toBeGreaterThanOrEqual(44);
        expect(cible.rognePar, ou).toEqual([]);
      }
    }
  });

  it('l’attente est vue à toutes les largeurs', async () => {
    render(wrap(<CompareClient />));
    const attente = screen.getByTestId('compare-chargement');
    for (const largeur of [320, 767, 768, 1366]) {
      // VU, pas seulement « display ≠ none » : un ancêtre `hidden`, un `invisible` ou un
      // `opacity-0` laisseraient un écran vide pendant l'attente.
      expect(await nonVu(attente, largeur), `à ${largeur} px`).toBeNull();
    }
    expect(await affichage(attente, 320)).toBe('block');
  });
});

/**
 * TCK-2509 (maquette A, BarrePartager) — la barre « Ajouter un bien · Partager » est fixée en bas au
 * téléphone : la page réserve sa hauteur SOUS le pied de page, sinon le bas du pied de page passe
 * dessous (relevé au navigateur : pied de page à 844 = bas de l'écran, barre de 767 à 844).
 */
describe('<CompareClient> — la réserve de la barre « Partager »', () => {
  it('avec les colonnes, la page réserve la barre sous son pied de page', () => {
    Object.assign(reponse, {
      properties: [11, 12, 13].map((id) => makeProperty({ id, slug: `bien-${id}`, title: `Bien ${id}` })),
      loading: false,
    });
    const { container } = render(wrap(<CompareClient />));
    const page = container.firstElementChild as HTMLElement;
    expect(page.contains(screen.getByTestId('pied-de-page'))).toBe(true);
    for (const c of RESERVE_BARRE_PARTAGER.split(' ')) expect(page.classList, c).toContain(c);
    expect(document.querySelector('[data-barre-partager]')).toBeTruthy();
  });

  it('pendant l’attente, ni barre ni réserve', () => {
    const { container } = render(wrap(<CompareClient />));
    const page = container.firstElementChild as HTMLElement;
    expect(document.querySelector('[data-barre-partager]')).toBeNull();
    expect(page.className).not.toContain('safe-area-inset-bottom');
  });
});
