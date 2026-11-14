/**
 * TCK-2650 (pour TCK-2625) — une échéance réglée ailleurs entre la lecture et le geste : l'initiation
 * répond 409, et la page relit le résumé du loyer ET l'historique (les dus en sont une lecture), pour
 * cesser d'offrir un paiement qui n'a plus lieu d'être. L'erreur reste rendue à l'appelant.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider, type QueryKey } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { ApiError, apiRequest } from '@/lib/api';
import { paymentsQueryKeys } from '@/lib/queries/payments';
import { useInitiatePayment } from '../useInitiatePayment';

vi.mock('next-intl', () => ({ useLocale: () => 'fr' }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: null }) }));
vi.mock('@/components/auth/garde-double-facteur-contexte', () => ({ useGardeDoubleFacteur: () => null }));
vi.mock('@/lib/double-facteur', () => ({ avecGardeDoubleFacteur: (envoi: () => unknown) => envoi() }));
vi.mock('@/lib/api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/api')>();
  return { ...reel, apiRequest: vi.fn() };
});

const envoi = vi.mocked(apiRequest);
const DEJA_PAYEE = new ApiError(409, { code: 'payment.already_paid', message: 'Cette échéance est déjà payée.' });

const RESUME = paymentsQueryKeys.resumeDuLoyer;
const DUS = paymentsQueryKeys.history({ status: 'pending,partially_paid,late,failed', sort: 'date', per_page: 50, date_to: '2027-05-13' });
const HISTORIQUE = paymentsQueryKeys.history({ sort: '-date', page: 1, per_page: 20 });
const AUTRE: QueryKey = ['leases', 'detail', 22];

function monter() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  for (const cle of [RESUME, DUS, HISTORIQUE, AUTRE]) client.setQueryData(cle, { data: 'avant' });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, ...renderHook(() => useInitiatePayment('lease-payments', 9001), { wrapper }) };
}

const invalidee = (client: QueryClient, cle: QueryKey) => client.getQueryState(cle)?.isInvalidated;

// Le refus se pose dans `beforeEach`, comme le test de TCK-2048 : posé dans le corps du test, vitest
// impute au test la promesse rejetée que la doublure garde.
beforeEach(() => {
  envoi.mockReset();
  envoi.mockRejectedValue(DEJA_PAYEE);
});

describe('TCK-2650 — l’initiation refusée (409) relit le résumé et l’historique', () => {
  it('« déjà payée » : le résumé, les dus et l’historique sont relus, l’erreur rendue à l’appelant', async () => {
    const { client, result } = monter();

    let rendue: unknown = null;
    await act(async () => {
      await result.current.mutateAsync({ provider: 'wave', returnUrl: 'https://x/r', cancelUrl: 'https://x/c' }).catch((e: unknown) => (rendue = e));
    });

    expect(rendue).toBeInstanceOf(ApiError);
    expect((rendue as ApiError).status).toBe(409);
    expect(invalidee(client, RESUME)).toBe(true);
    expect(invalidee(client, DUS)).toBe(true);
    expect(invalidee(client, HISTORIQUE)).toBe(true);
    expect(invalidee(client, AUTRE)).toBe(false);
  });
});
