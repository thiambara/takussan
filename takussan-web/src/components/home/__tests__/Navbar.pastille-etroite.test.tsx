/**
 * TCK-563 (M3, retour testeur du 2026-09-23) — la pastille de recherche à 320 px CSS.
 *
 * La capture du testeur est prise à 320 px CSS (iPhone en zoom d'affichage : logo de 165 px image
 * pour 82 px CSS). Mesuré au navigateur sur l'arbre (Chrome headless, CDP, 2026-09-23) : la
 * pastille y mesure 93 px, il reste 43 px au libellé AU REPOS — « Chercher » en mesure 60
 * (« Cherc… »), « Search » 45 (« Searc… »), « Seet » 29. TCK-549 ne garantissait le libellé
 * entier qu'à 360.
 *
 * La pastille est un conteneur de requête : sous un seuil, le libellé au repos passe en `sr-only`
 * (il reste le NOM ACCESSIBLE du bouton) et la loupe se centre. jsdom ne résout aucune requête de
 * conteneur : on lit le seuil dans la classe, et on le confronte aux largeurs mesurées — comme
 * `Navbar.gouttiere.test.tsx` résout ses `px-*` à la main.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl, type LocaleDeTest } from '@/test/intl';

let parametresUrl = new URLSearchParams();
let chemin = '/fr';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => parametresUrl,
  usePathname: () => chemin,
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, isLoading: false, setUser: vi.fn(), token: null }),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({ data: [] }),
  ApiError: class extends Error {},
}));

vi.mock('@/hooks/useSuggest', () => ({
  useSuggest: () => ({ data: undefined, isLoading: false, isFetching: false }),
}));

const { Navbar } = await import('@/components/home/Navbar');

/** Largeur de CONTENU de la pastille (bordure et `px-3` retirées), mesurée au navigateur. */
const CONTENU_A_320 = 67;
const CONTENU_A_360 = 107;
/** Loupe (16) + écart (8) + le plus long libellé au repos des trois langues (« Chercher », 60). */
const REQUIS_LIBELLE_ENTIER = 16 + 8 + 60;

function monter(locale: LocaleDeTest = 'fr') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>{withIntl(<Navbar />, locale)}</QueryClientProvider>,
  );
}

function pastille(): HTMLElement {
  const candidates = screen
    .getAllByRole('button')
    .filter((b) => b.getAttribute('aria-haspopup') === 'dialog' && !b.hasAttribute('aria-label'));
  expect(candidates).toHaveLength(1);
  return candidates[0]!;
}

/** Le seuil (en px) d'une variante `@max-[<n>rem]:<utilitaire>` portée par l'élément, ou null. */
function seuilDe(el: Element, utilitaire: string): number | null {
  // Découpe à la main plutôt qu'une expression régulière : Tailwind scanne aussi les tests, et
  // aucune chaîne de ce fichier ne doit ressembler à une classe.
  for (const classe of el.className.split(/\s+/)) {
    const fin = classe.indexOf(']:');
    if (!classe.startsWith('@max-[') || fin < 0 || classe.slice(fin + 2) !== utilitaire) continue;
    const valeur = classe.slice('@max-['.length, fin);
    if (valeur.endsWith('rem')) return Number(valeur.slice(0, -3)) * 16;
  }
  return null;
}

/** Vrai si l'élément est masqué visuellement pour une largeur de contenu donnée. */
function masqueA(el: Element, largeur: number): boolean {
  const seuil = seuilDe(el, 'sr-only');
  // `@max-[n]` s'applique STRICTEMENT sous n (`width < n`).
  return seuil !== null && largeur < seuil;
}

describe('Pastille mobile à 320 px CSS (TCK-563, M3)', () => {
  beforeEach(() => {
    parametresUrl = new URLSearchParams();
    chemin = '/fr';
  });

  it.each(['fr', 'en', 'wo'] as const)(
    '%s — au repos, le libellé ne s’affiche jamais tronqué : masqué à 320, entier à 360, et il reste le nom du bouton',
    (locale) => {
      monter(locale);
      const bouton = pastille();
      const libelle = bouton.querySelector('span.truncate');
      expect(libelle).not.toBeNull();

      // À 320 il ne reste que 43 px au texte : le libellé doit disparaître plutôt que se couper.
      expect(masqueA(libelle!, CONTENU_A_320)).toBe(true);
      // Le seuil laisse passer le plus long libellé entier…
      const seuil = seuilDe(libelle!, 'sr-only')!;
      expect(seuil).toBeGreaterThanOrEqual(REQUIS_LIBELLE_ENTIER);
      // …et rien ne change à 360 (TCK-549 AC4).
      expect(masqueA(libelle!, CONTENU_A_360)).toBe(false);

      // `sr-only` et non `hidden` : le texte nomme toujours le bouton.
      expect(bouton).toHaveAccessibleName(libelle!.textContent!);
    },
  );

  it('au repos, sous le seuil, la loupe est centrée sans écart résiduel', () => {
    monter();
    const bouton = pastille();
    const contenu = bouton.querySelector('[data-slot="contenu-pastille"]');
    const seuil = seuilDe(bouton.querySelector('span.truncate')!, 'sr-only');
    expect(contenu).not.toBeNull();
    expect(seuilDe(contenu!, 'justify-center')).toBe(seuil);
    // Sans `gap-0`, l'écart vers le libellé invisible décalait la loupe de 4 px (mesuré).
    expect(seuilDe(contenu!, 'gap-0')).toBe(seuil);
  });

  it('un lieu en vigueur n’est JAMAIS masqué : c’est la donnée du visiteur, pas un libellé', () => {
    chemin = '/fr/properties';
    parametresUrl = new URLSearchParams('q=Dakar');
    monter();
    const bouton = pastille();
    const lieu = screen.getByText('Dakar');
    expect(bouton).toContainElement(lieu);
    expect(masqueA(lieu, CONTENU_A_320)).toBe(false);
    // Et la loupe ne se centre pas par-dessus un texte affiché.
    expect(seuilDe(bouton.querySelector('[data-slot="contenu-pastille"]')!, 'justify-center')).toBeNull();
  });
});
