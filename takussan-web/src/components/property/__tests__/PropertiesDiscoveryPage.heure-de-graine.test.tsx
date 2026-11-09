import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';

/**
 * TCK-1008 (P55.01) — les liens de pagination portent l'heure de graine de la page affichée.
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

/**
 * TCK-2499 — la pagination numérotée a cédé la place à « Voir N biens de plus », qui reste un LIEN
 * vers la page suivante (robots, clic modifié). La graine voyage avec lui ; le chemin du début,
 * rendu quand l'URL ouvre une page au-delà de la première, garde la forme canonique.
 */
const lienSuivant = () => screen.getByRole('link', { name: /^Voir \d+ biens? de plus$/ });
const parametresDe = (lien: HTMLElement) => new URLSearchParams((lien.getAttribute('href') ?? '').split('?')[1] ?? '');

beforeEach(() => {
  mockApiFetch.mockReset();
  parametres = new URLSearchParams('contract_type=rent');
});

describe('TCK-1008 — l’heure de graine voyage avec la page suivante', () => {
  it('le lien « Voir N biens de plus » porte la page suivante et la `seed_hour` de la réponse', async () => {
    mockApiFetch.mockResolvedValue(reponse(1, '2026-10-13T00'));
    render(withIntl(<PropertiesDiscoveryPage />));
    await screen.findByTestId('carte-22');

    const suivant = parametresDe(lienSuivant());
    expect(suivant.get('page')).toBe('2');
    expect(suivant.get('seed_hour')).toBe('2026-10-13T00');
    expect(suivant.get('contract_type')).toBe('rent');
  });

  it('page 2 ouverte par l’URL : le chemin du début garde la forme canonique, la suite mène à la 3', async () => {
    parametres = new URLSearchParams('contract_type=rent&page=2&seed_hour=2026-10-13T00');
    mockApiFetch.mockResolvedValue(reponse(2, '2026-10-13T00'));
    render(withIntl(<PropertiesDiscoveryPage />));
    await screen.findByTestId('carte-22');

    expect(screen.getByRole('link', { name: 'Revenir aux premiers biens' })).toHaveAttribute(
      'href',
      '/fr/properties?contract_type=rent',
    );
    expect(parametresDe(lienSuivant()).get('page')).toBe('3');
    expect(parametresDe(lienSuivant()).get('seed_hour')).toBe('2026-10-13T00');
  });

  it('une réponse sans `seed_hour` (API antérieure) n’écrit rien', async () => {
    mockApiFetch.mockResolvedValue(reponse(1));
    render(withIntl(<PropertiesDiscoveryPage />));
    await screen.findByTestId('carte-22');

    expect(parametresDe(lienSuivant()).has('seed_hour')).toBe(false);
  });
});
