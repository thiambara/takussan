/**
 * TCK-1373 (P135.05) — trois listes dessinées pour être entières lisent TOUTES leurs pages : les
 * relevés bancaires de l'agence, les tâches d'un client (et le compte des tâches ouvertes du
 * panneau du pipeline), et « Mes avis ».
 *
 * Avant : une page de 50, sans pagination à l'écran. L'API est bouchonnée : 20 par défaut, 100 au
 * plus, `meta.last_page`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { StatementsList } from '@/components/admin/reconciliation/StatementsList';
import { CustomerDetailSheet } from '@/components/pipeline/CustomerDetailSheet';
import { fetchCustomerTasks } from '../pipeline';
import { useAuthoredReviews } from '../reviews';

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton', user: { id: 1, roles: ['agent'] } }) }));

const releves = Array.from({ length: 51 }, (_, i) => ({
  id: 51 - i,
  bank_name: `Banque ${51 - i}`,
  status: 'reconciled',
  reconciled_ratio: 1,
  skipped_lines_count: 0,
}));
// 55 tâches terminées aux échéances anciennes, puis 5 ouvertes : `sort=due_at` les met en fin.
const taches = Array.from({ length: 60 }, (_, i) => ({
  id: i + 1,
  title: `Tâche ${i + 1}`,
  status: i < 55 ? 'done' : 'pending',
  due_at: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T09:00:00Z`,
}));
const avis = Array.from({ length: 51 }, (_, i) => ({ id: i + 1, rating: 5, comment: `Avis ${i + 1}` }));

function bouchonnerApi() {
  const lus: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = new URL(String(url), 'http://api.test');
      if (u.pathname === '/api/customers/9') {
        return new Response(
          JSON.stringify({ data: { id: 9, first_name: 'Awa', last_name: 'Diop', phone: null, email: null, pipeline_stage: 'lead' } }),
          { status: 200 },
        );
      }
      const lignes: unknown[] =
        u.pathname === '/api/agencies/3/bank-statements' ? releves
          : u.pathname === '/api/tasks' ? taches
            : u.pathname === '/api/reviews' ? avis
              : [];
      const perPage = Math.min(Number(u.searchParams.get('per_page') ?? 20), 100);
      const page = Number(u.searchParams.get('page') ?? 1);
      lus.push(`${u.pathname} ${page} ${u.searchParams.get('sort')}`);
      return new Response(
        JSON.stringify({
          data: lignes.slice((page - 1) * perPage, page * perPage),
          meta: { current_page: page, last_page: Math.max(1, Math.ceil(lignes.length / perPage)), per_page: perPage, total: lignes.length },
        }),
        { status: 200 },
      );
    }),
  );
  return lus;
}

function Fournisseur({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return withIntl(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}

describe('TCK-1373 — toutes les pages', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('la liste des relevés rend le 51ᵉ', async () => {
    const lus = bouchonnerApi();
    render(<Fournisseur><StatementsList agencyId={3} /></Fournisseur>);

    expect(await screen.findByRole('link', { name: 'Banque 1' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /^Banque / })).toHaveLength(51);
    expect(lus.every((l) => l.endsWith('-created_at'))).toBe(true);
  });

  it('les tâches d’un client sont toutes lues, dans l’ordre des échéances', async () => {
    const lus = bouchonnerApi();
    const lues = await fetchCustomerTasks('jeton', 9);

    expect(lues).toHaveLength(60);
    expect(lus.filter((l) => l.startsWith('/api/tasks'))).toEqual(['/api/tasks 1 due_at']);
    expect(lues.filter((t) => t.status === 'pending')).toHaveLength(5);
  });

  it('le panneau du pipeline compte les 5 tâches ouvertes au-delà des 50 premières', async () => {
    bouchonnerApi();
    render(<Fournisseur><CustomerDetailSheet customerId={9} onOpenChange={() => {}} /></Fournisseur>);

    const libelle = await screen.findByText('Tâches actives');
    await waitFor(() => expect(libelle.nextElementSibling).toHaveTextContent(/^5$/));
  });

  it('« Mes avis » rend le 51ᵉ avis', async () => {
    bouchonnerApi();
    const { result } = renderHook(() => useAuthoredReviews(), { wrapper: Fournisseur });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data).toHaveLength(51);
  });
});
