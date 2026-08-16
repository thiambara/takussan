import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';

import fr from '@/messages/fr.json';
import en from '@/messages/en.json';
import wo from '@/messages/wo.json';
import { HomepageDiscovery } from '../HomepageDiscovery';
import type {
  HomepageDiscoveryData,
  PropertyListItem,
} from '@/types/property';
import type { UseHomepageDiscoveryParams } from '@/hooks/useHomepageDiscovery';

/**
 * TCK-247 — the homepage row titles must be DERIVED from the payload.
 *
 * The interesting failure this file guards against is a component that reads
 * the visitor's geolocated city straight from `UserLocationProvider` and prints
 * it: it looks right in every nominal case and lies in exactly the case the
 * backend added a flag for. So the fallback tests below deliberately set the
 * geolocated city and the served city to DIFFERENT values.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

let mockRows: HomepageDiscoveryData | null = null;
let mockLoading = false;
let mockFailed = false;
const discoveryCalls: UseHomepageDiscoveryParams[] = [];

vi.mock('@/hooks/useHomepageDiscovery', () => ({
  HOMEPAGE_DISCOVERY_PER_ROW: 12,
  useHomepageDiscovery: (params: UseHomepageDiscoveryParams = {}) => {
    discoveryCalls.push(params);
    return { rows: mockRows, loading: mockLoading, failed: mockFailed };
  },
}));

let mockGeoCity: string | undefined;

vi.mock('@/components/providers/UserLocationProvider', () => ({
  useUserLocation: () => ({
    location: mockGeoCity ? { city: mockGeoCity } : null,
    loading: false,
    city: mockGeoCity ?? 'Dakar',
  }),
}));

vi.mock('@/components/home/Navbar', () => ({ Navbar: () => <nav /> }));
vi.mock('@/components/home/Footer', () => ({ Footer: () => <footer /> }));
vi.mock('@/components/property/RecentlyViewedCarousel', () => ({
  RecentlyViewedCarousel: () => <div />,
}));
vi.mock('@/components/property/cards/BogolanPattern', () => ({
  BogolanPattern: () => <svg />,
}));

vi.mock('@/components/property/cards/PropertyRow', () => ({
  PropertyRow: ({
    variant,
    eyebrow,
    title,
    viewAllHref,
    properties,
    error,
  }: {
    variant: string;
    eyebrow?: string;
    title: string;
    viewAllHref?: string;
    properties: readonly PropertyListItem[];
    error: string | null;
  }) => (
    <section data-testid={`row-${variant}`} data-href={viewAllHref}>
      <p data-testid={`eyebrow-${variant}`}>{eyebrow}</p>
      <h2 data-testid={`title-${variant}`}>{title}</h2>
      {error ? <p data-testid={`error-${variant}`}>{error}</p> : null}
      <ul>
        {properties.map((p) => (
          <li key={p.id} data-testid={`card-${variant}-${p.id}`}>
            {p.title}
          </li>
        ))}
      </ul>
    </section>
  ),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeProperty(id: number, city = 'Dakar'): PropertyListItem {
  return {
    id,
    slug: `prop-${id}`,
    title: `Property ${id}`,
    price: 1000,
    currency: 'XOF',
    type: 'house',
    contract_type: 'rent',
    rent_period: 'monthly',
    bedrooms: null,
    bathrooms: null,
    area: null,
    furnished: false,
    featured: false,
    main_photo_url: null,
    published_at: null,
    created_at: '2024-01-01',
    location: {
      quarter: null,
      city,
      region: null,
      country: null,
      latitude: null,
      longitude: null,
    },
    reference_number: '',
    status: null,
    visibility: null,
  };
}

/** Mirrors the endpoint's payload: `near` carries the row's own provenance. */
function makeRows(near: HomepageDiscoveryData['near']): HomepageDiscoveryData {
  return {
    near,
    rent: { items: [makeProperty(20)] },
    featured: { items: [makeProperty(30)] },
    latest: { items: [makeProperty(40)] },
  };
}

const MESSAGES = { fr, en, wo } as const;

function renderPage(locale: keyof typeof MESSAGES = 'fr') {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={MESSAGES[locale]}
      timeZone="Africa/Dakar"
    >
      <HomepageDiscovery />
    </NextIntlClientProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('<HomepageDiscovery> — TCK-247', () => {
  beforeEach(() => {
    mockRows = null;
    mockLoading = false;
    mockFailed = false;
    mockGeoCity = undefined;
    discoveryCalls.length = 0;
  });

  describe('titre de la rangée « Près de toi »', () => {
    it('nomme la ville du visiteur quand le serveur a servi cette ville', () => {
      mockGeoCity = 'Ziguinchor';
      mockRows = makeRows({
        items: [makeProperty(1, 'Ziguinchor')],
        city: 'Ziguinchor',
        requested_city: 'Ziguinchor',
        fallback: false,
      });

      renderPage();

      expect(screen.getByTestId('title-standard')).toHaveTextContent(
        'À découvrir à Ziguinchor',
      );
      expect(screen.getByTestId('eyebrow-standard')).toHaveTextContent(
        'Près de toi',
      );
    });

    it('bascule sur le titre de repli, qui nomme la ville RÉELLEMENT montrée', () => {
      // Le visiteur est à Ziguinchor, le serveur a rempli la rangée avec Dakar.
      // Un titre qui répète « Ziguinchor » serait faux.
      mockGeoCity = 'Ziguinchor';
      mockRows = makeRows({
        items: [makeProperty(1, 'Dakar')],
        city: 'Dakar',
        requested_city: 'Ziguinchor',
        fallback: true,
      });

      renderPage();

      const title = screen.getByTestId('title-standard');
      expect(title).toHaveTextContent(
        "Peu d'annonces à Ziguinchor — à découvrir à Dakar",
      );
      expect(screen.getByTestId('eyebrow-standard')).toHaveTextContent(
        'Ailleurs au Sénégal',
      );
    });

    it("ne titre PAS « près de toi » sur la ville devinée quand le serveur a replié — le titre vient de la donnée, pas du provider géo", () => {
      mockGeoCity = 'Ziguinchor';
      mockRows = makeRows({
        items: [makeProperty(1, 'Dakar')],
        city: 'Dakar',
        requested_city: 'Ziguinchor',
        fallback: true,
      });

      renderPage();

      expect(screen.getByTestId('title-standard')).not.toHaveTextContent(
        'À découvrir à Ziguinchor',
      );
      // Et le lien « tout voir » suit la ville servie, pas la ville devinée.
      expect(screen.getByTestId('row-standard').dataset.href).toBe(
        '/properties?city=Dakar',
      );
    });

    it('reste sur le titre nominal quand la ville du visiteur est inconnue (ce n’est pas un repli)', () => {
      mockGeoCity = undefined;
      mockRows = makeRows({
        items: [makeProperty(1, 'Dakar')],
        city: 'Dakar',
        requested_city: null,
        fallback: false,
      });

      renderPage();

      expect(screen.getByTestId('title-standard')).toHaveTextContent(
        'À découvrir à Dakar',
      );
      expect(screen.getByTestId('eyebrow-standard')).toHaveTextContent(
        'Près de toi',
      );
    });

    it('rend les deux titres en anglais et en wolof', () => {
      const nominal: HomepageDiscoveryData['near'] = {
        items: [makeProperty(1, 'Ziguinchor')],
        city: 'Ziguinchor',
        requested_city: 'Ziguinchor',
        fallback: false,
      };
      const fallen: HomepageDiscoveryData['near'] = {
        items: [makeProperty(1, 'Dakar')],
        city: 'Dakar',
        requested_city: 'Ziguinchor',
        fallback: true,
      };

      mockRows = makeRows(nominal);
      const enNominal = renderPage('en');
      expect(screen.getByTestId('title-standard')).toHaveTextContent(
        'Discover Ziguinchor',
      );
      enNominal.unmount();

      mockRows = makeRows(fallen);
      const enFallback = renderPage('en');
      expect(screen.getByTestId('title-standard')).toHaveTextContent(
        'Few listings in Ziguinchor — discover Dakar',
      );
      expect(screen.getByTestId('eyebrow-standard')).toHaveTextContent(
        'Elsewhere in Senegal',
      );
      enFallback.unmount();

      mockRows = makeRows(nominal);
      const woNominal = renderPage('wo');
      expect(screen.getByTestId('title-standard')).toHaveTextContent(
        'Gis Ziguinchor',
      );
      woNominal.unmount();

      mockRows = makeRows(fallen);
      renderPage('wo');
      expect(screen.getByTestId('title-standard')).toHaveTextContent(
        'Kër yu néew ci Ziguinchor — gis Dakar',
      );
      expect(screen.getByTestId('eyebrow-standard')).toHaveTextContent(
        'Feneen ci Senegaal',
      );
    });
  });

  describe('câblage sur l’endpoint unique', () => {
    it('alimente les quatre rangées depuis une seule réponse', () => {
      mockRows = makeRows({
        items: [makeProperty(10)],
        city: 'Dakar',
        requested_city: null,
        fallback: false,
      });

      renderPage();

      expect(screen.getByTestId('card-standard-10')).toBeInTheDocument();
      expect(screen.getByTestId('card-listing-20')).toBeInTheDocument();
      expect(screen.getByTestId('card-cover-30')).toBeInTheDocument();
      expect(screen.getByTestId('card-compact-40')).toBeInTheDocument();

      // Une seule source de données pour les quatre rangées.
      const distinctParams = new Set(discoveryCalls.map((c) => JSON.stringify(c)));
      expect(distinctParams.size).toBe(1);
    });

    it('transmet la ville devinée, et rien quand elle est inconnue', () => {
      mockGeoCity = 'Thiès';
      const first = renderPage();
      expect(discoveryCalls.at(-1)?.nearCity).toBe('Thiès');
      first.unmount();

      discoveryCalls.length = 0;
      mockGeoCity = undefined;
      renderPage();
      // Surtout pas « Dakar » : le backend distingue « on ne sait pas » de
      // « ville sans annonces », et seul le second rebaptise la rangée.
      expect(discoveryCalls.at(-1)?.nearCity).toBeUndefined();
    });

    it('affiche le message d’erreur traduit sur les quatre rangées', () => {
      mockFailed = true;
      mockRows = null;

      renderPage();

      for (const variant of ['standard', 'listing', 'cover', 'compact']) {
        expect(screen.getByTestId(`error-${variant}`)).toHaveTextContent(
          'Impossible de charger les annonces pour le moment.',
        );
      }
    });
  });
});
