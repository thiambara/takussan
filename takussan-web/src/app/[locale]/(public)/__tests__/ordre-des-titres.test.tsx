/**
 * Aucun niveau de titre sauté sur les pages publiques — TCK-946 (P31.05).
 *
 * Trois défauts mesurés par axe au navigateur, trois rendus :
 *
 *  · le pied de page titrait ses colonnes en `h4` : sur une page dont le contenu n'a qu'un `h1`
 *    (mentions légales, CGU, comparateur vide…), `heading-order` tombait sur `#pied-discover` ;
 *  · la recherche passait du `h1` de la liste au `h3` de la première carte ;
 *  · `/fr/agencies` passait du `h1` de l'index au `h3` de `ProfileCard`.
 *
 * Le juge est la règle `heading-order` d'axe elle-même (`src/test/ordre-des-titres.ts`), pas une
 * réécriture. Le pied de page est monté RÉEL dans les trois rendus : c'est lui qui ferme chaque
 * page publique, et c'est son ordre qui casse derrière un contenu court.
 *
 * Ce qui est doublé, et pourquoi : la `Navbar` et sa cale (leurs propres tests, leurs propres
 * dépendances — et aucun titre), la carte géographique et la sauvegarde de recherche (absentes
 * de la vue liste ou sans titre), la frontière réseau (`apiFetch`, `listerProfilsPublics`).
 * Les cartes de bien, elles, sont les VRAIES : leur `h3` est la moitié du défaut.
 */
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { titresHorsOrdre } from '@/test/ordre-des-titres';
import { CompareProvider } from '@/context/CompareContext';
import { ToastProvider } from '@/components/ui/toast';
import type { ProfilPublic } from '@/lib/queries/public-profiles';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/fr/properties',
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...reste }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...reste}>
      {children}
    </a>
  ),
}));

// Le choix de langue du pied de page appelle cette action serveur ; hors requête, `cookies()` lève.
vi.mock('@/app/actions/locale', () => ({ setLocaleAction: vi.fn(async () => {}) }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, token: null, isLoading: false }),
}));

vi.mock('@/components/home/Navbar', () => ({ Navbar: () => null }));
vi.mock('@/components/home/NavbarSpacer', () => ({ NavbarSpacer: () => null }));
vi.mock('@/components/search/ChoixDuReferentiel', () => import('@/components/search/__tests__/doublure-choix-du-referentiel'));
vi.mock('@/components/map', () => ({ PropertyMap: () => null }));
vi.mock('@/components/favorites/SaveSearchButton', () => ({ SaveSearchButton: () => null }));

const mockApiFetch = vi.fn();
vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl');
  const fr = (await import('@/messages/fr.json')).default;
  return {
    getTranslations: async (namespace?: string) =>
      createTranslator({ locale: 'fr', messages: fr as never, namespace: namespace as never }),
    getLocale: async () => 'fr',
  };
});

const lister = vi.fn();
vi.mock('@/lib/queries/public-profiles', async (importOriginal) => {
  const vrai = await importOriginal<typeof import('@/lib/queries/public-profiles')>();
  return { ...vrai, listerProfilsPublics: (...args: unknown[]) => lister(...args) };
});

/**
 * jsdom ne lit aucune feuille : un titre passé de `sr-only` à `hidden` (retiré de l'arbre
 * d'accessibilité au navigateur) y resterait visible, et axe ne verrait rien. Ce qui se juge ici, ce
 * sont donc ses classes — `sr-only`, et aucun `hidden`, à quelque palier que ce soit.
 */
function classesDe(titre: HTMLElement): string[] {
  return titre.className.split(/\s+/).filter(Boolean);
}
const CACHE_AU_LECTEUR = /(^|:)hidden$/;

const { Footer } = await import('@/components/home/Footer');
const { PropertiesDiscoveryPage } = await import('@/components/property/PropertiesDiscoveryPage');
const { IndexDeProfils } = await import('@/components/public/index/IndexDeProfils');

beforeAll(() => {
  // Les cartes de bien se révèlent à l'entrée dans le viewport ; jsdom n'a pas d'observateur.
  class ObservateurInerte {
    observe() {}
    disconnect() {}
    unobserve() {}
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function avecFournisseurs(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return withIntl(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <CompareProvider>{ui}</CompareProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('TCK-946 — heading-order sur les pages publiques', () => {
  it('le pied de page sous un contenu qui n’a qu’un `h1` (mentions légales, CGU, favoris vides)', async () => {
    render(
      withIntl(
        <>
          <main>
            <h1>Mentions légales</h1>
            <p>Un seul titre dans le contenu.</p>
          </main>
          <Footer />
        </>,
      ),
    );

    expect(await titresHorsOrdre()).toEqual([]);
  });

  it('la recherche : du `h1` de la liste aux cartes de bien, puis au pied de page', async () => {
    mockApiFetch.mockResolvedValue({
      data: [
        {
          id: 22,
          slug: 'villa-22',
          title: 'Villa à Dieuppeul',
          price: 950000,
          currency: 'XOF',
          type: 'house',
          contract_type: 'rent',
          rent_period: 'monthly',
          main_photo_url: null,
          published_at: '2026-06-01T10:00:00Z',
          created_at: '2026-06-01T10:00:00Z',
          location: { quarter: 'Dieuppeul', city: 'Dakar', region: null, country: null, latitude: null, longitude: null },
        },
      ],
      meta: { total: 1, per_page: 30, current_page: 1, last_page: 1 },
      search: { strategy: 'all', terms_unmatched: [], widened_total: null },
    });
    render(avecFournisseurs(<PropertiesDiscoveryPage titre="Biens à louer à Dakar" />));

    // La carte RÉELLE est rendue : son titre est un des deux bouts du saut mesuré.
    expect(await screen.findByRole('heading', { name: 'Villa à Dieuppeul' })).toBeInTheDocument();
    expect(await titresHorsOrdre()).toEqual([]);

    // Le `h2` de la grille reste dans l'arbre d'accessibilité : masqué à l'œil, pas au lecteur.
    const titreDeGrille = screen.getByRole('heading', { level: 2, name: 'Résultats de la recherche' });
    expect(classesDe(titreDeGrille)).toContain('sr-only');
    expect(classesDe(titreDeGrille).filter((c) => CACHE_AU_LECTEUR.test(c))).toEqual([]);
  });

  it('l’index des agences : du `h1` de l’index aux cartes de profil, puis au pied de page', async () => {
    const profil: ProfilPublic = {
      id: 7,
      slug: 'sahel-homes',
      nom: 'Sahel Homes',
      logo_url: null,
      is_verified: true,
      city: 'Dakar',
      cities: ['Dakar'],
      portfolio_count: 12,
      rent_count: 8,
      sale_count: 4,
      reviews: { average: 4.5, count: 6 },
    };
    lister.mockResolvedValue({ profils: [profil], page: 1, dernierePage: 1, total: 1, villes: ['Dakar'] });
    const element = await IndexDeProfils({
      ressource: 'agencies',
      locale: 'fr',
      params: new URLSearchParams(''),
      page: 1,
      forme: 'carre',
    });
    render(withIntl(element));

    expect(screen.getByRole('heading', { name: /Sahel Homes/ })).toBeInTheDocument();
    expect(await titresHorsOrdre()).toEqual([]);

    const titreDeGrille = screen.getByRole('heading', { level: 2, name: '1 agence' });
    expect(classesDe(titreDeGrille).filter((c) => CACHE_AU_LECTEUR.test(c))).toEqual([]);
  });
});
