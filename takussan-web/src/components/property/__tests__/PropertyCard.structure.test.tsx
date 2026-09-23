/**
 * TCK-554 — la carte de bien n'imbrique AUCUN contrôle dans son lien.
 *
 * La carte entière était un `<a>` qui contenait le favori et le comparateur : HTML invalide, et
 * un nom accessible qui lisait toute la carte, boutons compris (« Villa … Ajouter aux favoris
 * Ajouter au comparateur il y a 3 mois … »). Le lien porte désormais le seul titre, et couvre la
 * carte en étant lui-même VIDE et étiré (`LienDeCarte`) ; les deux boutons sont ses FRÈRES, posés
 * au-dessus.
 *
 * Le même contrat vaut pour les cinq cartes : `PropertyCard` (liste, biens similaires, favoris)
 * et les quatre variantes de `PropertyRow` (accueil, récemment consultés) — la contrainte du
 * ticket exige un comportement identique sur toutes ces surfaces.
 *
 * ⚠ jsdom ne calcule aucune mise en page : que le pseudo-élément couvre réellement la carte, et
 * que les zones tactiles mesurent 44 px sans se chevaucher, se vérifie au navigateur (notes du
 * ticket). Ici on tient la STRUCTURE et le COMPORTEMENT.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentType } from 'react';

import { withIntl } from '@/test/intl';
import { CompareProvider } from '@/context/CompareContext';
import { ToastProvider } from '@/components/ui/toast';
import type { PropertyListItem } from '@/types/property';
import type { PropertyCardCommonProps } from '../cards/types';
import { PropertyCard } from '../PropertyCard';
import { PropertyCardStandard } from '../cards/PropertyCardStandard';
import { PropertyCardCover } from '../cards/PropertyCardCover';
import { PropertyCardCompact } from '../cards/PropertyCardCompact';
import { PropertyCardListing } from '../cards/PropertyCardListing';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/fr/properties',
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, token: null, isLoading: false }),
}));

beforeAll(() => {
  // `PropertyCard` révèle sa carte à l'entrée dans le viewport ; jsdom n'a pas d'observateur.
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

const TITRE = 'Villa luxueuse à Dieuppeul';

const BIEN: PropertyListItem = {
  id: 4242,
  slug: 'villa-luxueuse-a-dieuppeul',
  title: TITRE,
  price: 950000,
  currency: 'XOF',
  type: 'house',
  contract_type: 'rent',
  rent_period: 'monthly',
  bedrooms: 3,
  bathrooms: 2,
  area: 240,
  furnished: false,
  featured: false,
  main_photo_url: null,
  published_at: '2026-06-01T10:00:00Z',
  created_at: '2026-06-01T10:00:00Z',
  location: { quarter: 'Dieuppeul', city: 'Dakar', region: null, country: null, latitude: null, longitude: null },
  reference_number: 'REF-1',
  status: null,
  visibility: null,
} as PropertyListItem;

function monte(Carte: ComponentType<PropertyCardCommonProps>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <CompareProvider>
            <Carte property={BIEN} />
          </CompareProvider>
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

const CARTES: ReadonlyArray<[string, ComponentType<PropertyCardCommonProps>, { comparateur: boolean }]> = [
  ['PropertyCard (liste, similaires, favoris)', PropertyCard, { comparateur: true }],
  ['PropertyCardStandard (accueil, récemment consultés)', PropertyCardStandard, { comparateur: false }],
  ['PropertyCardListing (accueil)', PropertyCardListing, { comparateur: false }],
  ['PropertyCardCover (accueil)', PropertyCardCover, { comparateur: false }],
  ['PropertyCardCompact (accueil)', PropertyCardCompact, { comparateur: false }],
];

describe.each(CARTES)('%s — TCK-554', (_nom, Carte, { comparateur }) => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("n'imbrique aucun contrôle dans un lien", () => {
    const { container } = monte(Carte);
    expect(container.querySelectorAll('a button, a [role=button]')).toHaveLength(0);
    // Le favori existe bien — sinon le zéro ci-dessus ne dirait rien.
    expect(screen.getByRole('button', { name: /ajouter aux favoris/i })).toBeInTheDocument();
    if (comparateur) {
      expect(screen.getByRole('button', { name: /ajouter au comparateur/i })).toBeInTheDocument();
    }
  });

  it('porte UN seul lien vers la fiche, nommé par le titre du bien et rien d’autre', () => {
    monte(Carte);
    const liens = screen.getAllByRole('link');
    expect(liens).toHaveLength(1);
    // `name` en chaîne : correspondance EXACTE du nom accessible calculé.
    const lien = screen.getByRole('link', { name: TITRE });
    expect(lien).toHaveAttribute('href', expect.stringMatching(/\/properties\/villa-luxueuse-a-dieuppeul$/));
  });

  it('étire le lien sur toute la carte, les contrôles restant au-dessus et à 44 px', () => {
    const { container } = monte(Carte);
    const lien = screen.getByRole('link', { name: TITRE });
    // Le lien est VIDE et couvre son parent, qui est le cadre positionné de la carte : un ancêtre
    // positionné intermédiaire réduirait la surface cliquable à cet ancêtre.
    expect(lien.childElementCount).toBe(0);
    expect(lien.className).toMatch(/(^|\s)absolute(\s|$)/);
    expect(lien.className).toMatch(/(^|\s)inset-0(\s|$)/);
    expect(lien.parentElement?.className).toMatch(/(^|\s)relative(\s|$)/);
    const racine = container.firstElementChild as HTMLElement;
    expect(racine.contains(lien)).toBe(true);
    for (const bouton of within(racine).getAllByRole('button')) {
      expect(bouton.closest('a')).toBeNull();
      // Au-dessus du lien, sinon le tap l'atteindrait à travers le bouton.
      expect(bouton.closest('.z-10')).not.toBeNull();
      // Zone tactile de 44 px, sans agrandir le dessin (mesurée au navigateur : notes du ticket).
      expect(bouton.className).toMatch(/(^|\s)before:size-11(\s|$)/);
    }
  });

  it('un clic sur favori ne touche pas le lien et bascule le favori', () => {
    monte(Carte);
    const lien = screen.getByRole('link', { name: TITRE });
    const atteint = vi.fn();
    lien.addEventListener('click', atteint);
    const urlAvant = window.location.href;

    const favori = screen.getByRole('button', { name: /ajouter aux favoris/i });
    fireEvent.click(favori);

    expect(atteint).not.toHaveBeenCalled();
    expect(window.location.href).toBe(urlAvant);
    expect(screen.getByRole('button', { name: /retirer des favoris/i })).toHaveAttribute('aria-pressed', 'true');
  });

  if (comparateur) {
    it('un clic sur comparateur ne touche pas le lien', () => {
      monte(Carte);
      const lien = screen.getByRole('link', { name: TITRE });
      const atteint = vi.fn();
      lien.addEventListener('click', atteint);

      fireEvent.click(screen.getByRole('button', { name: /ajouter au comparateur/i }));

      expect(atteint).not.toHaveBeenCalled();
    });
  }
});
