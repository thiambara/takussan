/**
 * TCK-2807 — la fiche du bail ne propose plus « Réessayer » sur un 403 : elle dit le refus, comme
 * `QueryBoundary` (TCK-2751) et les fiches de la réservation et de la visite. Une panne (500, réseau)
 * garde sa reprise, et un clic relance la lecture.
 *
 * La lecture du bail est la VRAIE (`useLease` → `useApiQuery` → `apiRequest`) sur un `fetch` doublé :
 * l'`ApiError` naît de la réponse, et la relance se compte en requêtes vers `/api/leases/5`.
 */
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { LeaseDetail } from '../LeaseDetail';

vi.mock('@/lib/queries/leases', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/leases')>()),
  // Les échéances ne sont pas l'objet du test : seule la lecture du bail passe par le réseau doublé.
  useLeasePayments: () => ({ data: undefined }),
}));
vi.mock('@/hooks/usePaymentProviders', () => ({ usePaymentProviders: () => ({ providers: [], isLoading: false }) }));
vi.mock('@/hooks/useVueDansLUrl', () => ({ useVueDansLUrl: () => ({ params: new URLSearchParams(), remplacer: vi.fn() }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 9 }, token: 'jeton-du-lecteur' }) }));

const fetchMock = vi.fn();
const lecturesDuBail = () => fetchMock.mock.calls.filter(([url]) => /\/api\/leases\/5(\?|$)/.test(String(url))).length;

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const avecClient = (ui: ReactNode) => <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
  return render(withIntl(avecClient(<LeaseDetail leaseId={5} />)));
}

const reponse = (status: number, corps: unknown) =>
  new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('<LeaseDetail> sur une lecture en erreur (TCK-2807)', () => {
  it('AC1 — un 403 dit le refus, sans « Réessayer » et sans rien du bail', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(reponse(403, { message: 'This action is unauthorized.' })));
    rendre();

    expect(await screen.findByText('Votre profil actif ne permet pas d\'ouvrir ce bail.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
    expect(screen.queryByText('Bail introuvable.')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('AC2 — une panne (500) propose « Réessayer », et un clic relance la lecture', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(reponse(500, { message: 'Server Error' })));
    rendre();

    const reessayer = await screen.findByRole('button', { name: 'Réessayer' });
    expect(lecturesDuBail()).toBe(1);
    await userEvent.click(reessayer);
    await vi.waitFor(() => expect(lecturesDuBail()).toBe(2));
  });

  it('AC2 — une erreur réseau propose « Réessayer », et un clic relance la lecture', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
    rendre();

    const reessayer = await screen.findByRole('button', { name: 'Réessayer' });
    expect(lecturesDuBail()).toBe(1);
    await userEvent.click(reessayer);
    await vi.waitFor(() => expect(lecturesDuBail()).toBe(2));
  });
});
