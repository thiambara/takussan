/**
 * TCK-1367 (P135.01) — la fiche client et le panneau du pipeline lisent TOUTES les notes du client.
 *
 * Avant : `fetchCustomerNotes` ne demandait ni `page` ni `per_page`, et l'API pagine les notes par
 * 20 : un client à 25 notes n'en montrait que 20, et l'onglet affichait « Notes (20) ». Le serveur
 * est bouchonné comme l'API : 20 par défaut, 100 au plus, `meta.last_page`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { CustomerDetail } from '@/types/customer';
import { withIntl } from '@/test/intl';
import { FilDuClient } from '@/components/customer-dashboard/fiche/FilDuClient';
import { fetchCustomerNotes } from '../customers';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/app/customers/9',
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: null, user: null, isLoading: false }) }));

const TOTAL = 25;
// La plus ancienne (page 2 de l'API) est épinglée.
const notes = Array.from({ length: TOTAL }, (_, i) => ({ id: TOTAL - i, body: `note ${TOTAL - i}`, pinned: TOTAL - i === 1, created_at: '2026-11-01T10:00:00+00:00' }));

function bouchonnerApi() {
  const urls: URL[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = new URL(String(url), 'http://api.test');
      urls.push(u);
      const perPage = Math.min(Number(u.searchParams.get('per_page') ?? 20), 100);
      const page = Number(u.searchParams.get('page') ?? 1);
      return new Response(
        JSON.stringify({
          data: notes.slice((page - 1) * perPage, page * perPage),
          meta: { current_page: page, last_page: Math.ceil(TOTAL / perPage), per_page: perPage, total: TOTAL },
        }),
        { status: 200 },
      );
    }),
  );
  return urls;
}

describe('fetchCustomerNotes — toutes les pages (TCK-1367)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rend les 25 notes, dans l’ordre de l’API', async () => {
    const urls = bouchonnerApi();

    const lues = await fetchCustomerNotes('jeton', 9);

    expect(lues).toHaveLength(TOTAL);
    expect(lues.map((n) => n.id)).toEqual(notes.map((n) => n.id));
    expect(urls.every((u) => u.pathname === '/api/customers/9/notes')).toBe(true);
    // TCK-1842 (P186.03) — `sort` était inerte : l'API sert les épinglées d'abord, puis les plus récentes.
    expect(urls.some((u) => u.searchParams.has('sort'))).toBe(false);
  });

  // TCK-2589 — l'onglet « Notes (25) » est passé dans le fil de la fiche, qui lit ses notes page par
  // page côté serveur ; ses ÉPINGLÉES, elles, viennent de cette lecture-ci : une épinglée de la page 2
  // doit y paraître.
  it('une épinglée de la deuxième page paraît en tête du fil', async () => {
    bouchonnerApi();
    const lues = await fetchCustomerNotes('jeton', 9);

    render(withIntl(
      <QueryClientProvider client={new QueryClient()}>
        <FilDuClient customer={{ id: 9 } as CustomerDetail} notes={lues} demandeDeSaisie={null} />
      </QueryClientProvider>,
    ));

    const tete = document.querySelector('[data-slot="epinglees-du-fil"]') as HTMLElement;
    expect(within(tete).getByText('note 1')).toBeInTheDocument();
    expect(screen.getAllByText(/^note \d+$/)).toHaveLength(1);
  });
});
