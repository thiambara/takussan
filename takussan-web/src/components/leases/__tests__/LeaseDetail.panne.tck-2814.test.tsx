/**
 * TCK-2814 (AC2) — la fiche du bail distingue la panne, l'absence et le refus. Une panne (500) ne se
 * dit plus « Bail introuvable. » et garde « Réessayer » ; un 404 dit « Bail introuvable. » sans
 * reprise ; le 403 reste celui de TCK-2807.
 *
 * Même harnais que `LeaseDetail.refus.tck-2807.test.tsx` : la VRAIE lecture sur un `fetch` doublé.
 */
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { LeaseDetail } from '../LeaseDetail';

vi.mock('@/lib/queries/leases', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/leases')>()),
  useLeasePayments: () => ({ data: undefined }),
}));
vi.mock('@/hooks/usePaymentProviders', () => ({ usePaymentProviders: () => ({ providers: [], isLoading: false }) }));
vi.mock('@/hooks/useVueDansLUrl', () => ({ useVueDansLUrl: () => ({ params: new URLSearchParams(), remplacer: vi.fn() }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 9 }, token: 'jeton-du-lecteur' }) }));

const fetchMock = vi.fn();

function rendre(status: number) {
  fetchMock.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify({ message: 'x' }), { status, headers: { 'Content-Type': 'application/json' } })),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const avecClient = (ui: ReactNode) => <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
  return render(withIntl(avecClient(<LeaseDetail leaseId={5} />)));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('<LeaseDetail> : panne, introuvable, refus (TCK-2814)', () => {
  it('AC2 — une panne (500) dit la panne et propose « Réessayer », jamais « Bail introuvable. »', async () => {
    rendre(500);
    expect(await screen.findByText('Le bail n’a pas pu être chargé.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    expect(screen.queryByText('Bail introuvable.')).toBeNull();
  });

  it('AC2 — un 404 dit « Bail introuvable. », sans « Réessayer »', async () => {
    rendre(404);
    expect(await screen.findByText('Bail introuvable.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
  });

  it('AC2 — un 403 reste le refus de TCK-2807, sans « Réessayer »', async () => {
    rendre(403);
    expect(await screen.findByText('Votre profil actif ne permet pas d\'ouvrir ce bail.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
    expect(screen.queryByText('Bail introuvable.')).toBeNull();
  });
});
