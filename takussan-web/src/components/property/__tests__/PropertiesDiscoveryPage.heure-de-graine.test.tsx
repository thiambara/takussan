import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { withIntl } from '@/test/intl';

/**
 * TCK-998 (P55.01) — les liens de pagination portent l'heure de graine de la page affichée.
 *
 * Les places réservées de la page 1 se recalculent à chaque page, et la graine de rotation porte
 * l'heure : une page 2 servie après le changement d'heure répétait un bien de la page 1 et en
 * perdait un autre. L'API rend `seed_hour` ; la page suivante la renvoie, et l'API l'accepte si
 * elle vaut l'heure courante ou la précédente. Le lien de la page 1 garde la forme canonique
 * (TCK-557) : il ne la porte pas.
 */

let parametres = new URLSearchParams('');

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/fr/properties',
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

function reponse(page: number, seedHour?: string) {
  return {
    data: [{ id: 22, title: 'Villa', contract_type: 'rent' }],
    meta: { total: 12, per_page: 4, current_page: page, last_page: 3 },
    search: { strategy: 'all', terms_unmatched: [], widened_total: null },
    sponsored: [],
    ...(seedHour === undefined ? {} : { seed_hour: seedHour }),
  };
}

const hrefDe = (nom: string) =>
  within(screen.getByRole('navigation', { name: 'Pagination' })).getByRole('link', { name: nom }).getAttribute('href') ?? '';
const parametresDe = (nom: string) => new URLSearchParams(hrefDe(nom).split('?')[1] ?? '');

beforeEach(() => {
  mockApiFetch.mockReset();
  parametres = new URLSearchParams('contract_type=rent');
});

describe('TCK-998 — l’heure de graine voyage avec la pagination', () => {
  it('les liens vers les pages suivantes portent la `seed_hour` de la réponse', async () => {
    mockApiFetch.mockResolvedValue(reponse(1, '2026-10-13T00'));
    render(withIntl(<PropertiesDiscoveryPage />));
    await screen.findByTestId('carte-22');

    for (const nom of ['2', '3', 'Page suivante']) {
      expect(parametresDe(nom).get('seed_hour')).toBe('2026-10-13T00');
      expect(parametresDe(nom).get('contract_type')).toBe('rent');
    }
  });

  it('le lien de la page 1 garde la forme canonique', async () => {
    parametres = new URLSearchParams('contract_type=rent&page=2&seed_hour=2026-10-13T00');
    mockApiFetch.mockResolvedValue(reponse(2, '2026-10-13T00'));
    render(withIntl(<PropertiesDiscoveryPage />));
    await screen.findByTestId('carte-22');

    expect(hrefDe('1')).toBe('/fr/properties?contract_type=rent');
    expect(parametresDe('3').get('seed_hour')).toBe('2026-10-13T00');
  });

  it('une réponse sans `seed_hour` (API antérieure) n’écrit rien', async () => {
    mockApiFetch.mockResolvedValue(reponse(1));
    render(withIntl(<PropertiesDiscoveryPage />));
    await screen.findByTestId('carte-22');

    expect(parametresDe('2').has('seed_hour')).toBe(false);
  });
});
