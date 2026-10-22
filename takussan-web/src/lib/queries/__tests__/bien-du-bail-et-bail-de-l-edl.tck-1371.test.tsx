/**
 * TCK-1371 (P135.04) — le choix du bien d'un nouveau bail et celui du bail d'un état des lieux
 * lisent TOUTES les pages.
 *
 * Avant : une page de 100 biens louables (`useLeasePropertyOptions`) et une page de 50 baux actifs
 * (`InventoryLeasePicker`), sans page suivante ni recherche. L'API est bouchonnée : 20 par défaut,
 * 100 au plus, `meta.last_page`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { InventoryLeasePicker } from '@/components/inventory/InventoryLeasePicker';
import { useLeasePropertyOptions } from '../leases';

const biens = Array.from({ length: 101 }, (_, i) => ({ id: i + 1, title: `Bien ${String(i + 1).padStart(3, '0')}` }));
const baux = Array.from({ length: 51 }, (_, i) => ({
  id: 51 - i,
  reference_number: `LS-${51 - i}`,
  status: 'active',
  property: { id: 51 - i, title: `Logement ${51 - i}` },
}));

function bouchonnerApi() {
  const lus: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = new URL(String(url), 'http://api.test');
      const lignes = u.pathname === '/api/properties' ? biens : baux;
      const perPage = Math.min(Number(u.searchParams.get('per_page') ?? 20), 100);
      const page = Number(u.searchParams.get('page') ?? 1);
      lus.push(`${u.pathname} ${page} ${u.searchParams.get('sort')} ${u.searchParams.get('per_page')}`);
      return new Response(
        JSON.stringify({
          data: lignes.slice((page - 1) * perPage, page * perPage),
          meta: { current_page: page, last_page: Math.ceil(lignes.length / perPage), per_page: perPage, total: lignes.length },
        }),
        { status: 200 },
      );
    }),
  );
  return lus;
}

function fournisseur() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    withIntl(<QueryClientProvider client={client}>{children}</QueryClientProvider>)
  );
}

describe('TCK-1371 — toutes les pages', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('le formulaire de bail reçoit les 101 biens louables, le 101ᵉ compris', async () => {
    const lus = bouchonnerApi();
    const { result } = renderHook(() => useLeasePropertyOptions(), { wrapper: fournisseur() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data).toHaveLength(101);
    expect(result.current.data?.data.at(-1)).toMatchObject({ id: 101, title: 'Bien 101' });
    expect(lus).toEqual(['/api/properties 1 title 100', '/api/properties 2 title 100']);
  });

  it('le choix du bail d’un état des lieux ouvre le 51ᵉ bail actif', async () => {
    bouchonnerApi();
    const Fournisseur = fournisseur();
    render(<Fournisseur><InventoryLeasePicker /></Fournisseur>);

    const liens = await screen.findAllByRole('link', { name: /Logement/ });
    expect(liens).toHaveLength(51);
    expect(screen.getByRole('link', { name: /Logement 1\b/ })).toHaveAttribute('href', '/app/inventories/new?lease=1');
  });
});
