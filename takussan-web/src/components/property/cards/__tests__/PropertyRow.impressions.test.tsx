import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import type { PropertyListItem } from '@/types/property';
import { reinitialiserLesDeclarations } from '@/components/boost/impressions-affichees';

/**
 * TCK-2569 — la rangée vedette de l'accueil est un emplacement : chacune de ses cartes AFFICHÉES
 * déclare son impression ; une carte restée hors champ du carrousel ne déclare rien, et une rangée
 * ordinaire ne déclare jamais.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(''),
}));

const { carte } = vi.hoisted(() => ({
  carte: ({ property }: { property: { id: number } }) => <article data-testid={`carte-${property.id}`} />,
}));
vi.mock('../PropertyCardCover', () => ({ PropertyCardCover: carte }));
vi.mock('../PropertyCardStandard', () => ({ PropertyCardStandard: carte }));
vi.mock('../PropertyCardListing', () => ({ PropertyCardListing: carte }));
vi.mock('../PropertyCardCompact', () => ({ PropertyCardCompact: carte }));

import { PropertyRow } from '../PropertyRow';

/** Seule la carte `carte-1` est dans l'écran ; les autres sont hors champ du carrousel. */
class ObservateurPremiereCarte {
  constructor(private readonly rappel: IntersectionObserverCallback) {}
  observe(element: Element) {
    const visible = element.getAttribute('data-testid') === 'carte-1';
    queueMicrotask(() =>
      this.rappel(
        [{ target: element, isIntersecting: visible, intersectionRatio: visible ? 1 : 0 } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      ),
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
  vi.stubGlobal('IntersectionObserver', ObservateurPremiereCarte);
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const biens = [1, 2, 3].map((id) => ({ id, slug: `bien-${id}`, title: `Bien ${id}`, featured: true }) as unknown as PropertyListItem);

async function declares(): Promise<string[]> {
  await new Promise((r) => setTimeout(r, 0));
  window.dispatchEvent(new Event('pagehide'));
  return fetchSpy.mock.calls
    .filter(([url]) => String(url).endsWith('/public/properties/sponsored-impressions'))
    .flatMap(([, init]) => (init?.body as URLSearchParams).getAll('slugs[]'));
}

describe('PropertyRow — impressions de la rangée vedette (TCK-2569)', () => {
  it('une rangée d’emplacements ne déclare que ses cartes affichées', async () => {
    render(withIntl(<PropertyRow title="Coup de cœur" variant="cover" properties={biens} loading={false} error={null} robeVedette emplacementSponsorise />));
    await screen.findByTestId('carte-3');

    expect(await declares()).toEqual(['bien-1']);
  });

  it('une rangée ordinaire ne déclare rien', async () => {
    render(withIntl(<PropertyRow title="Tout juste publiés" variant="cover" properties={biens} loading={false} error={null} />));
    await screen.findByTestId('carte-3');

    expect(await declares()).toEqual([]);
  });
});
