import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import { withIntl } from '@/test/intl';

/**
 * TCK-555 — ce que la LISTE décide pour ses cartes : sa grille, et la transaction sur laquelle
 * elle est filtrée.
 *
 * La géométrie (une colonne sous `md`, photo de 246 px de haut à 360 px) se mesure au
 * navigateur — notes du ticket. Ici on tient les deux décisions que la carte ne peut pas prendre
 * seule : elle sert aussi le carrousel de la fiche et les favoris, où aucun filtre n'existe.
 */

let parametres = new URLSearchParams('');

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
vi.mock('@/components/map', () => ({ PropertyMap: () => null }));
vi.mock('@/components/favorites/SaveSearchButton', () => ({ SaveSearchButton: () => null }));
vi.mock('@/components/property/PropertyCard', () => ({
  PropertyCard: ({ property, transactionFiltree }: { property: { id: number }; transactionFiltree?: string }) => (
    <article data-testid={`carte-${property.id}`} data-transaction-filtree={transactionFiltree ?? ''} />
  ),
}));

import { PropertiesDiscoveryPage } from '../PropertiesDiscoveryPage';

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue({
    data: [{ id: 22, title: 'Villa', contract_type: 'rent' }],
    facets: { locations: {}, bedrooms: {}, types: {} },
    meta: { total: 1, per_page: 30, current_page: 1, last_page: 1 },
    search: { strategy: 'all', terms_unmatched: [], widened_total: null },
  });
});

describe('TCK-555 — la grille de /properties', () => {
  it('une colonne sous `md`, et les paliers de bureau inchangés', async () => {
    render(withIntl(<PropertiesDiscoveryPage />));
    const carte = await screen.findByTestId('carte-22');
    const classes = carte.parentElement!.className.split(/\s+/);
    expect(classes).toContain('grid-cols-1');
    expect(classes).not.toContain('grid-cols-2');
    // Bureau inchangé (contrainte du ticket) : les mêmes paliers qu'avant.
    expect(classes).toEqual(expect.arrayContaining(['md:grid-cols-3', 'xl:grid-cols-4', '2xl:grid-cols-5']));
  });

  it('transmet la transaction filtrée aux cartes', async () => {
    parametres = new URLSearchParams('contract_type=rent');
    render(withIntl(<PropertiesDiscoveryPage />));
    await waitFor(() => expect(screen.getByTestId('carte-22')).toHaveAttribute('data-transaction-filtree', 'rent'));
  });

  it('ne transmet rien sans filtre de transaction', async () => {
    parametres = new URLSearchParams('');
    render(withIntl(<PropertiesDiscoveryPage />));
    expect(await screen.findByTestId('carte-22')).toHaveAttribute('data-transaction-filtree', '');
  });
});
