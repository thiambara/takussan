import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { FilterSidebar } from '../FilterSidebar';

/**
 * TCK-1088 (P69.06) — le référentiel des filtres (villes, régions, équipements) ne se charge que
 * quand le panneau est VISIBLE : au montage dès `lg`, où le rail est affiché ; sous `lg`, à la
 * première ouverture du tiroir. Avant, le rail `hidden lg:block` restait monté sous `lg` et
 * demandait les trois listes à l'hydratation de la page (`geo/cities` : 55 Kio), panneau fermé.
 */

const REFERENTIEL = ['/api/public/geo/cities', '/api/public/geo/regions', '/api/public/amenities'];

function espionner() {
  const chemins: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      chemins.push(new URL(String(input), 'http://localhost').pathname);
      return { ok: true, status: 200, json: async () => ({ data: [] }) };
    }),
  );
  return chemins;
}

function largeur(estLarge: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('min-width: 1024px') ? estLarge : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

function monter(open: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const props = {
    filters: {},
    onFilterChange: vi.fn(),
    onReset: vi.fn(),
    activeCount: 0,
    onClose: vi.fn(),
  };
  const vue = render(
    withIntl(
      <QueryClientProvider client={client}>
        <FilterSidebar {...props} open={open} />
      </QueryClientProvider>,
    ),
  );
  return (ouvert: boolean) =>
    vue.rerender(
      withIntl(
        <QueryClientProvider client={client}>
          <FilterSidebar {...props} open={ouvert} />
        </QueryClientProvider>,
      ),
    );
}

const demandes = (chemins: string[]) => REFERENTIEL.filter((c) => chemins.includes(c));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('<FilterSidebar> — le référentiel se charge quand le panneau est visible', () => {
  it('sous `lg`, tiroir fermé : rien n’est demandé', async () => {
    largeur(false);
    const chemins = espionner();
    monter(false);

    // Laisser partir ce qui partirait au montage.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(demandes(chemins)).toEqual([]);
  });

  it('sous `lg`, à la première ouverture du tiroir : les trois listes', async () => {
    largeur(false);
    const chemins = espionner();
    const rerendre = monter(false);

    rerendre(true);
    await waitFor(() => expect(demandes(chemins)).toEqual(REFERENTIEL));
  });

  it('dès `lg`, le rail est visible : les trois listes au montage', async () => {
    largeur(true);
    const chemins = espionner();
    monter(false);

    await waitFor(() => expect(demandes(chemins)).toEqual(REFERENTIEL));
  });
});
