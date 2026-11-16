import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { reinitialiserLesDeclarations } from '@/components/boost/impressions-affichees';

/**
 * TCK-2569 (amendement d'ADR-0061 du 2026-11-16, option (a) du porteur) — la liste ne déclare que
 * les emplacements qu'elle AFFICHE : l'emplacement de tête qu'elle retire sous des places réservées
 * (AC1) et l'emplacement retiré pour doublon (AC2, `suiteDesPages`) ne déclarent rien. La
 * déclaration part de la cellule rendue, jamais de `sponsored` de la réponse.
 */

const parametres = new URLSearchParams('');

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/properties',
  useSearchParams: () => parametres,
}));

const mockApiFetch = vi.fn();
vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

vi.mock('@/components/home/Navbar', () => ({ Navbar: () => null }));
vi.mock('@/components/home/Footer', () => ({ Footer: () => null }));
vi.mock('@/components/search/ChoixDuReferentiel', () => import('@/components/search/__tests__/doublure-choix-du-referentiel'));
vi.mock('@/components/map', () => ({ PropertyMap: () => null }));
vi.mock('@/components/favorites/SaveSearchButton', () => ({ SaveSearchButton: () => null }));
vi.mock('@/components/property/PropertyCard', () => ({
  PropertyCard: ({ property }: { property: { id: number } }) => <article data-testid={`carte-${property.id}`} />,
}));

import { PropertiesDiscoveryPage } from '../PropertiesDiscoveryPage';

/** Tout élément observé est aussitôt « affiché » : seul ce qui est MONTÉ peut donc déclarer. */
class ObservateurToutVisible {
  constructor(private readonly rappel: IntersectionObserverCallback) {}
  observe(element: Element) {
    queueMicrotask(() =>
      this.rappel([{ target: element, isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], this as unknown as IntersectionObserver),
    );
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

let fetchSpy: MockInstance<typeof fetch>;

beforeEach(() => {
  reinitialiserLesDeclarations();
  mockApiFetch.mockReset();
  vi.stubGlobal('IntersectionObserver', ObservateurToutVisible);
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const bien = (id: number, extra: Record<string, unknown> = {}) => ({ id, slug: `bien-${id}`, title: `Bien ${id}`, contract_type: 'rent', ...extra });

function repondre(data: unknown[], sponsored: unknown[]) {
  mockApiFetch.mockResolvedValue({
    data,
    sponsored,
    meta: { total: data.length, per_page: 40, current_page: 1, last_page: 1 },
    search: { strategy: 'all', terms_unmatched: [], widened_total: null },
  });
}

/** Les slugs déclarés : le lot part à la sortie de la page. */
async function declares(): Promise<string[]> {
  await new Promise((r) => setTimeout(r, 0));
  window.dispatchEvent(new Event('pagehide'));
  return fetchSpy.mock.calls
    .filter(([url]) => String(url).endsWith('/public/properties/sponsored-impressions'))
    .flatMap(([, init]) => (init?.body as URLSearchParams).getAll('slugs[]'));
}

describe('TCK-2569 — seuls les emplacements affichés déclarent une impression', () => {
  it('AC1 — sous des places réservées, l’emplacement de tête non inséré ne déclare rien ; les insérés, une fois chacun', async () => {
    repondre(
      [bien(1, { placement: 'reserved' }), bien(2, { placement: 'reserved' }), bien(3), bien(4)],
      [bien(90, { placement: 'sponsored', position: 0 }), bien(91, { placement: 'sponsored', position: 3 })],
    );
    render(withIntl(<PropertiesDiscoveryPage />));
    await screen.findByTestId('carte-91');
    expect(screen.queryByTestId('carte-90')).toBeNull();

    expect(await declares()).toEqual(['bien-91']);
  });

  it('témoin — sans place réservée en tête, l’emplacement de tête est inséré et déclare', async () => {
    repondre([bien(3), bien(4)], [bien(90, { placement: 'sponsored', position: 0 })]);
    render(withIntl(<PropertiesDiscoveryPage />));
    await screen.findByTestId('carte-90');

    expect(await declares()).toEqual(['bien-90']);
  });

  it('AC2 — un emplacement retiré parce que son bien est déjà affiché ne déclare rien', async () => {
    repondre([bien(3), bien(4), bien(5)], [bien(3, { placement: 'sponsored', position: 2 })]);
    render(withIntl(<PropertiesDiscoveryPage />));
    await screen.findByTestId('carte-5');
    expect(screen.getAllByTestId('carte-3')).toHaveLength(1);

    expect(await declares()).toEqual([]);
  });

  it('un bien organique ou une place réservée ne déclare rien', async () => {
    repondre([bien(1, { placement: 'reserved' }), bien(3)], []);
    render(withIntl(<PropertiesDiscoveryPage />));
    await screen.findByTestId('carte-3');

    expect(await declares()).toEqual([]);
  });
});
