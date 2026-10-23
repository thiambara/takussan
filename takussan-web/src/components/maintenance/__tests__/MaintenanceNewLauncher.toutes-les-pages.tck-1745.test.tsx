/**
 * TCK-1745 (P171.01) — le lanceur d'une demande d'intervention lit TOUS les baux en cours, page par
 * page, et ne propose qu'une option par bien.
 *
 * Avant : une page de 50 baux (`per_page: 50`), sans page suivante : le bien du 51ᵉ bail en cours
 * ne se choisissait pas, et un bien porté par deux baux donnait deux options de même clé. L'API est
 * bouchonnée : 20 par défaut, 100 au plus, `meta.last_page`, tri `-created_at`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';

vi.mock('../MaintenanceForm', () => ({
  MaintenanceForm: ({ propertyId, leaseId }: { propertyId: number; leaseId: number }) => (
    <div data-testid="form">{`${propertyId}/${leaseId}`}</div>
  ),
}));

import { MaintenanceNewLauncher } from '../MaintenanceNewLauncher';

type Bail = { id: number; status: string; property: { id: number; title: string } };

function bouchonnerApi(baux: Bail[]) {
  const lus: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = new URL(String(url), 'http://api.test');
      const perPage = Math.min(Number(u.searchParams.get('per_page') ?? 20), 100);
      const page = Number(u.searchParams.get('page') ?? 1);
      lus.push(`${u.pathname} ${page} ${u.searchParams.get('filter[status]')} ${u.searchParams.get('per_page')}`);
      return new Response(
        JSON.stringify({
          data: baux.slice((page - 1) * perPage, page * perPage),
          meta: { current_page: page, last_page: Math.max(1, Math.ceil(baux.length / perPage)), per_page: perPage, total: baux.length },
        }),
        { status: 200 },
      );
    }),
  );
  return lus;
}

function Fournisseur({ children }: { readonly children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return withIntl(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}

describe('TCK-1745 — le lanceur lit tous les baux en cours', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('le bien du 51ᵉ bail en cours se choisit', async () => {
    // Du plus récent au plus ancien, comme `-created_at` : le 51ᵉ est le bail 1, sur le bien 1001.
    const baux = Array.from({ length: 51 }, (_, i) => ({
      id: 51 - i,
      status: 'active',
      property: { id: 1000 + 51 - i, title: `Logement ${51 - i}` },
    }));
    const lus = bouchonnerApi(baux);

    render(<Fournisseur><MaintenanceNewLauncher initialPropertyId={1001} /></Fournisseur>);

    expect((await screen.findByTestId('form')).textContent).toBe('1001/1');
    expect(lus.every((l) => l.startsWith('/api/leases ') && l.includes(' active,terminating '))).toBe(true);
  });

  it('un bien porté par deux baux en cours ne donne qu’une option, celle du bail le plus récent', async () => {
    bouchonnerApi([
      { id: 9, status: 'terminating', property: { id: 7, title: 'Villa Ngor' } },
      { id: 4, status: 'active', property: { id: 7, title: 'Villa Ngor' } },
      { id: 3, status: 'active', property: { id: 8, title: 'Studio Plateau' } },
    ]);

    render(<Fournisseur><MaintenanceNewLauncher /></Fournisseur>);

    await userEvent.click(await screen.findByRole('combobox'));
    expect(await screen.findAllByRole('option', { name: 'Villa Ngor' })).toHaveLength(1);
    await userEvent.click(screen.getByRole('option', { name: 'Villa Ngor' }));
    expect((await screen.findByTestId('form')).textContent).toBe('7/9');
  });
});
