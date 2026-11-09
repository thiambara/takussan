import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
import type { RaccourcisDeLAccueil } from '@/lib/queries/raccourcis-de-l-accueil';

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

// TCK-2495, revue — « Changer » lit le catalogue des villes, et une ville choisie fait relire tuiles et offre.
vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: (_cle: unknown, chemin: string, options?: { enabled?: boolean }) => ({
    data:
      chemin === '/api/public/properties/cities' && options?.enabled
        ? { data: [{ value: 'Dakar', count: 190 }, { value: 'Thiès', count: 8 }] }
        : undefined,
  }),
}));
const raccourcisRelus: (string | null)[] = [];
vi.mock('@/lib/queries/raccourcis-de-l-accueil', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/queries/raccourcis-de-l-accueil')>();
  return {
    ...reel,
    raccourcisDeLAccueil: async (ville: string | null) => {
      raccourcisRelus.push(ville);
      return { ville, quartiers: [{ nom: 'Randoulène', compte: 3 }], offre: { ville, location: 4, vente: 4 } };
    },
  };
});
vi.mock('@/components/home/Footer', () => ({ Footer: () => <footer /> }));
// Les bandeaux du site ne s'affichent qu'avec un client de requêtes, que le geste « Changer » impose désormais.
vi.mock('@/components/announcements/BandeauxDuSite', () => ({ BandeauxDuSite: () => null }));
vi.mock('@/components/property/RecentlyViewedCarousel', () => ({
  RecentlyViewedCarousel: () => (
    <div data-testid="recemment-consultes" />
  ),
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
    emplacementSponsorise,
    allegee,
    apresLeTitre,
  }: {
    variant: string;
    eyebrow?: string;
    title: string;
    viewAllHref?: string;
    properties: readonly PropertyListItem[];
    error: string | null;
    emplacementSponsorise?: boolean;
    allegee?: boolean;
    apresLeTitre?: React.ReactNode;
  }) => (
    <section
      data-testid={`row-${variant}`}
      data-href={viewAllHref}
      data-allegee={allegee ? 'oui' : undefined}
      data-emplacement={emplacementSponsorise ? 'sponsorise' : undefined}
    >
      <p data-testid={`eyebrow-${variant}`}>{eyebrow}</p>
      <h2 data-testid={`title-${variant}`}>{title}</h2>
      {apresLeTitre}
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

function renderPage(locale: keyof typeof MESSAGES = 'fr', raccourcis?: RaccourcisDeLAccueil) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const arbre = (r?: RaccourcisDeLAccueil) => (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider
        locale={locale}
        messages={MESSAGES[locale]}
        timeZone="Africa/Dakar"
      >
        <HomepageDiscovery raccourcis={r} />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const rendu = render(arbre(raccourcis));
  return { ...rendu, rerendre: () => rendu.rerender(arbre(raccourcis)) };
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

      expect(screen.getAllByTestId('title-standard')[0]).toHaveTextContent(
        'À Ziguinchor',
      );
      // TCK-2495 — « À <ville> », jamais « près de toi » : la position n'a pas été demandée.
      expect(screen.getAllByTestId('eyebrow-standard')[0]).toHaveTextContent('');
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

      const title = screen.getAllByTestId('title-standard')[0];
      expect(title).toHaveTextContent(
        "Peu d'annonces à Ziguinchor — à découvrir à Dakar",
      );
      expect(screen.getAllByTestId('eyebrow-standard')[0]).toHaveTextContent(
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

      expect(screen.getAllByTestId('title-standard')[0]).not.toHaveTextContent(
        /^À Ziguinchor$/,
      );
      // Et le lien « tout voir » suit la ville servie, pas la ville devinée.
      expect(screen.getAllByTestId('row-standard')[0].dataset.href).toBe(
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

      expect(screen.getAllByTestId('title-standard')[0]).toHaveTextContent('À Dakar');
      expect(screen.getAllByTestId('eyebrow-standard')[0]).not.toHaveTextContent('Près de toi');
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
      expect(screen.getAllByTestId('title-standard')[0]).toHaveTextContent('In Ziguinchor');
      enNominal.unmount();

      mockRows = makeRows(fallen);
      const enFallback = renderPage('en');
      expect(screen.getAllByTestId('title-standard')[0]).toHaveTextContent(
        'Few listings in Ziguinchor — discover Dakar',
      );
      expect(screen.getAllByTestId('eyebrow-standard')[0]).toHaveTextContent(
        'Elsewhere in Senegal',
      );
      enFallback.unmount();

      mockRows = makeRows(nominal);
      const woNominal = renderPage('wo');
      // Wolof en pause (2026-10-16) : la clé neuve porte le français tel quel.
      expect(screen.getAllByTestId('title-standard')[0]).toHaveTextContent('À Ziguinchor');
      woNominal.unmount();

      mockRows = makeRows(fallen);
      renderPage('wo');
      expect(screen.getAllByTestId('title-standard')[0]).toHaveTextContent(
        'Kër yu néew ci Ziguinchor — gis Dakar',
      );
      expect(screen.getAllByTestId('eyebrow-standard')[0]).toHaveTextContent(
        'Feneen ci Senegaal',
      );
    });
  });

  describe('câblage sur l’endpoint unique', () => {
    it('alimente les trois rangées depuis une seule réponse — « À louer » quitte l’accueil (TCK-2495)', () => {
      mockRows = makeRows({
        items: [makeProperty(10)],
        city: 'Dakar',
        requested_city: null,
        fallback: false,
      });

      renderPage();

      expect(screen.getByTestId('card-standard-10')).toBeInTheDocument();
      expect(screen.queryByTestId('card-standard-20')).toBeNull();
      expect(screen.getByTestId('card-cover-30')).toBeInTheDocument();
      expect(screen.getByTestId('card-compact-40')).toBeInTheDocument();

      // Une seule source de données pour les rangées.
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

    it('affiche le message d’erreur traduit sur les trois rangées', () => {
      mockFailed = true;
      mockRows = null;

      renderPage();

      const erreurs = ['standard', 'cover', 'compact'].flatMap((v) => screen.getAllByTestId(`error-${v}`));
      expect(erreurs).toHaveLength(3);
      for (const e of erreurs) {
        expect(e).toHaveTextContent('Impossible de charger les annonces pour le moment.');
      }
    });
  });
});

const RACCOURCIS: RaccourcisDeLAccueil = {
  ville: 'Dakar',
  quartiers: [
    { nom: 'Mermoz', compte: 12 },
    { nom: 'Point E', compte: 9 },
  ],
  offre: { ville: 'Dakar', location: 127, vente: 63 },
};

describe('<HomepageDiscovery> — TCK-2495 « Deux gestes »', () => {
  beforeEach(() => {
    mockRows = makeRows({ items: [makeProperty(1)], city: 'Dakar', requested_city: null, fallback: false });
    mockLoading = false;
    mockFailed = false;
    mockGeoCity = undefined;
  });

  it('le `<h1>` quitte l’écran, pas la page', () => {
    renderPage();
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent(fr.homepage.h1);
    expect(h1.className.split(/\s+/)).toContain('sr-only');
  });

  it('trois rangées au plus, de grammaire distincte, toutes en cartes allégées', () => {
    renderPage('fr', RACCOURCIS);
    const rangees = screen.getAllByTestId(/^row-/);
    expect(rangees.map((r) => r.dataset.testid)).toEqual(['row-standard', 'row-cover', 'row-compact']);
    expect(rangees.every((r) => r.dataset.allegee === 'oui')).toBe(true);
    // « Récemment consultés » quitte l’accueil : une quatrième rangée, et des biens déjà vus plus haut.
    expect(screen.queryByTestId('recemment-consultes')).toBeNull();
  });

  it('aucun bien n’apparaît dans deux rangées ; la vedette garde les siens', () => {
    mockRows = {
      near: { items: [makeProperty(1), makeProperty(2), makeProperty(3)], city: 'Dakar', requested_city: null, fallback: false },
      rent: { items: [makeProperty(9)] },
      featured: { items: [makeProperty(2), makeProperty(4)] },
      latest: { items: [makeProperty(3), makeProperty(4), makeProperty(5)] },
    };
    renderPage('fr', RACCOURCIS);
    const cartes = screen.getAllByTestId(/^card-/).map((c) => c.dataset.testid!.replace(/^card-\w+-/, ''));
    expect(new Set(cartes).size).toBe(cartes.length);
    expect(screen.getByTestId('card-cover-2')).toBeInTheDocument();
    expect(screen.getByTestId('card-cover-4')).toBeInTheDocument();
    expect(screen.queryByTestId('card-standard-2')).toBeNull();
    expect(screen.queryByTestId('card-compact-3')).toBeNull();
  });

  it('les quartiers en tuiles, chacune vers la liste de son quartier', () => {
    renderPage('fr', RACCOURCIS);
    const section = screen.getByRole('region', { name: 'Quartiers de Dakar' });
    const liens = within(section).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(liens).toContain('/fr/properties?city=Dakar&location=Mermoz');
    expect(liens).toContain('/fr/properties?city=Dakar&location=Point+E');
    expect(section).toHaveTextContent('12 annonces');
  });

  it('sans quartiers servis, pas de section vide', () => {
    renderPage('fr', { ...RACCOURCIS, quartiers: null });
    expect(screen.queryByRole('region', { name: /Quartiers de/ })).toBeNull();
  });

  it('le bloc propriétaire est chiffré par l’offre de la ville, et mène à la publication', () => {
    renderPage('fr', RACCOURCIS);
    const bloc = screen.getByRole('region', { name: 'Vous avez un bien à louer ou à vendre ?' });
    expect(bloc).toHaveTextContent('127 locations et 63 ventes sont en ligne à Dakar en ce moment.');
    expect(within(bloc).getByRole('link', { name: 'Publier gratuitement' })).toHaveAttribute('href', '/publish');
  });

  it('sans offre connue, le bloc ne montre AUCUN chiffre plutôt qu’un chiffre faux', () => {
    renderPage('fr', { ...RACCOURCIS, offre: null });
    const bloc = screen.getByRole('region', { name: 'Vous avez un bien à louer ou à vendre ?' });
    expect(bloc.textContent).not.toMatch(/\d/);
  });
});

describe('<HomepageDiscovery> — TCK-2495, AC1 : Louer | Acheter et les catégories au téléphone', () => {
  beforeEach(() => {
    mockRows = makeRows({ items: [makeProperty(1)], city: 'Dakar', requested_city: null, fallback: false });
    mockLoading = false;
    mockFailed = false;
    mockGeoCity = undefined;
  });

  function categories() {
    return within(screen.getByRole('list', { name: 'Types de bien' })).getAllByRole('link');
  }

  it('rendus sous `lg` (masqués seulement au bureau), avant les rangées', () => {
    renderPage('fr', RACCOURCIS);
    const bloc = screen.getByRole('region', { name: 'Louer ou acheter, puis un type de bien' });
    const classes = bloc.className.split(/\s+/);
    expect(classes).toContain('lg:hidden');
    expect(classes).not.toContain('hidden');
    expect(bloc.compareDocumentPosition(screen.getAllByTestId(/^row-/)[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(categories().length).toBeGreaterThanOrEqual(4);
  });

  it('« Louer » choisi par défaut : une catégorie ouvre la liste des locations de ce type', () => {
    renderPage('fr', RACCOURCIS);
    expect(screen.getByRole('button', { name: 'Louer' })).toHaveAttribute('aria-pressed', 'true');
    expect(categories()[0]).toHaveAttribute('href', '/fr/properties?contract_type=rent&type=apartment');
  });

  it('« Acheter » touché : les catégories ouvrent la vente ; un second appui retire la transaction', () => {
    renderPage('fr', RACCOURCIS);
    fireEvent.click(screen.getByRole('button', { name: 'Acheter' }));
    expect(categories()[1]).toHaveAttribute('href', '/fr/properties?contract_type=sale&type=studio');
    fireEvent.click(screen.getByRole('button', { name: 'Acheter' }));
    expect(categories()[1]).toHaveAttribute('href', '/fr/properties?type=studio');
  });
});

// TCK-704 (P18.02, ADR-0061 §7) — la rangée vedette est le seul emplacement de l'accueil : la seule
// dont un clic note l'arrivée sponsorisée. Ailleurs, un clic n'est pas celui d'une place payée.
describe('<HomepageDiscovery> — TCK-704', () => {
  beforeEach(() => {
    mockRows = makeRows({ items: [makeProperty(1)], city: 'Dakar', requested_city: null, fallback: false });
    mockLoading = false;
    mockFailed = false;
    mockGeoCity = undefined;
  });

  it('seule la rangée vedette est un emplacement sponsorisé', () => {
    renderPage('fr', RACCOURCIS);

    const emplacements = document.querySelectorAll('[data-emplacement="sponsorise"]');
    expect(emplacements).toHaveLength(1);
    expect(emplacements[0]).toHaveAttribute('data-href', '/properties?featured=true');
  });
});

describe('<HomepageDiscovery> — TCK-2495, revue : « À Dakar · Changer » change la ville', () => {
  beforeEach(() => {
    mockRows = makeRows({ items: [makeProperty(1)], city: 'Dakar', requested_city: null, fallback: false });
    mockLoading = false;
    mockFailed = false;
    mockGeoCity = 'Dakar';
    discoveryCalls.length = 0;
    raccourcisRelus.length = 0;
  });

  it('« Changer » ouvre les villes du catalogue ; en choisir une redemande les rangées pour elle', async () => {
    const user = userEvent.setup();
    renderPage('fr', RACCOURCIS);
    const changer = screen.getByRole('button', { name: 'Changer de ville (actuellement Dakar)' });
    expect(changer).toHaveTextContent('Changer');
    await user.click(changer);
    await user.click(await screen.findByRole('menuitem', { name: 'Thiès' }));
    // La ville choisie l'emporte sur la ville devinée (Dakar).
    expect(discoveryCalls.at(-1)?.nearCity).toBe('Thiès');
  });

  it('les tuiles et l’offre suivent la ville des rangées, jamais celles de la ville d’avant', async () => {
    const user = userEvent.setup();
    const { rerendre } = renderPage('fr', RACCOURCIS);
    await user.click(screen.getByRole('button', { name: /Changer de ville/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Thiès' }));

    mockRows = makeRows({ items: [makeProperty(2, 'Thiès')], city: 'Thiès', requested_city: 'Thiès', fallback: false });
    rerendre();
    expect(screen.getByTestId('title-standard')).toHaveTextContent('À Thiès');
    // Pendant la relecture : rien de Dakar sous un titre « À Thiès » (ni tuiles, ni chiffres).
    expect(screen.queryByText('Mermoz')).toBeNull();
    expect(screen.getByRole('region', { name: 'Vous avez un bien à louer ou à vendre ?' })).not.toHaveTextContent('Dakar');
    expect(await screen.findByRole('region', { name: 'Quartiers de Thiès' })).toBeInTheDocument();
    expect(raccourcisRelus).toEqual(['Thiès']);
    expect(screen.queryByText('Mermoz')).toBeNull();
    expect(screen.getByRole('region', { name: 'Vous avez un bien à louer ou à vendre ?' })).toHaveTextContent(
      '4 locations et 4 ventes sont en ligne à Thiès en ce moment.',
    );
  });

  it('sans choix, rien n’est relu : le serveur a déjà servi les tuiles (témoin)', () => {
    renderPage('fr', RACCOURCIS);
    expect(raccourcisRelus).toEqual([]);
    expect(screen.getByRole('region', { name: 'Quartiers de Dakar' })).toBeInTheDocument();
  });
});
