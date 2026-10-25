/**
 * TCK-2048 (P182.02) — après l'échec d'un geste de transition, l'écran relit l'état.
 *
 * Mesuré le 2026-10-24 : `useApiMutation` n'invalidait ses clés qu'en `onSuccess`. Un geste en
 * erreur (422 de garde d'état, coupure après écriture) laissait la fiche sur le statut d'avant,
 * le bouton affiché d'après le cache, et le second essai rendait 422 ou 409.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider, type QueryKey } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { ApiError, apiRequest } from '@/lib/api';
import { useApiMutation } from '../useApiQuery';
import { useCancelBooking, useConfirmBooking, useRejectBooking } from '@/lib/queries/bookings';
import {
  useInvoiceCancel,
  useInvoiceMarkPaid,
  useInvoiceSend,
  usePayoutApprove,
  usePayoutCancel,
  usePayoutMarkFailed,
  usePayoutMarkProcessed,
} from '@/lib/queries/payments';
import { useCancelCommission, useMarkCommissionPaid } from '@/lib/queries/commissions';
import { useAcceptMaintenance, useDeclineMaintenance } from '@/lib/queries/maintenance';
import { useActivateLease } from '@/lib/queries/leases';
import { useCancelVisit, useCompleteVisit, useConfirmVisit, useMarkVisitNoShow } from '@/lib/queries/visits';

vi.mock('next-intl', () => ({ useLocale: () => 'fr' }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: null }) }));
vi.mock('@/components/auth/garde-double-facteur-contexte', () => ({ useGardeDoubleFacteur: () => null }));
vi.mock('@/lib/double-facteur', () => ({ avecGardeDoubleFacteur: (envoi: () => unknown) => envoi() }));
vi.mock('@/lib/api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/api')>();
  return { ...reel, apiRequest: vi.fn() };
});

const envoi = vi.mocked(apiRequest);
const REFUS = new ApiError(422, { code: 'invoice.not_draft_send', message: 'Déjà envoyée.' });

function monter<T>(hook: () => T, cles: QueryKey[]) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  for (const cle of cles) client.setQueryData(cle, { data: 'avant' });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(hook, { wrapper }) };
}

const invalidee = (client: QueryClient, cle: QueryKey) => client.getQueryState(cle)?.isInvalidated;

describe('useApiMutation — option relireSurErreur (TCK-2048)', () => {
  beforeEach(() => {
    envoi.mockReset();
    envoi.mockRejectedValue(REFUS);
  });

  it('invalide les clés déclarées quand le geste échoue, et rend l’erreur à l’appelant', async () => {
    const onError = vi.fn();
    const { client, result } = monter(
      () => useApiMutation<unknown, void>({ path: '/api/x' }, { invalidate: [['x']], relireSurErreur: true, onError }),
      [['x'], ['y']],
    );

    await act(async () => {
      await result.current.mutateAsync().catch(() => undefined);
    });

    expect(invalidee(client, ['x'])).toBe(true);
    expect(invalidee(client, ['y'])).toBe(false);
    expect(onError).toHaveBeenCalledWith(REFUS, undefined, undefined, expect.anything());
  });

  it('sans l’option, un échec ne relit rien (formulaires)', async () => {
    const { client, result } = monter(
      () => useApiMutation<unknown, void>({ path: '/api/x' }, { invalidate: [['x']] }),
      [['x']],
    );

    await act(async () => {
      await result.current.mutateAsync().catch(() => undefined);
    });

    expect(invalidee(client, ['x'])).toBe(false);
  });

  it('une invalidation calculée depuis la réponse n’est pas rejouée sur erreur', async () => {
    const invalidate = vi.fn(() => [['x']]);
    const { client, result } = monter(
      () => useApiMutation<unknown, void>({ path: '/api/x' }, { invalidate, relireSurErreur: true }),
      [['x']],
    );

    await act(async () => {
      await result.current.mutateAsync().catch(() => undefined);
    });

    expect(invalidate).not.toHaveBeenCalled();
    expect(invalidee(client, ['x'])).toBe(false);
  });
});

describe('les gestes de transition relisent après une erreur (TCK-2048, P182.02)', () => {
  beforeEach(() => {
    envoi.mockReset();
    envoi.mockRejectedValue(REFUS);
  });

  const GESTES: Array<[string, () => { mutateAsync: (v?: never) => Promise<unknown> }, QueryKey]> = [
    ['réservation annulée', () => useCancelBooking(1) as never, ['bookings', 'detail', 1]],
    ['réservation confirmée', () => useConfirmBooking(1) as never, ['bookings', 'detail', 1]],
    ['réservation refusée', () => useRejectBooking(1) as never, ['bookings', 'detail', 1]],
    ['facture envoyée', () => useInvoiceSend(1) as never, ['invoices']],
    ['facture payée', () => useInvoiceMarkPaid(1) as never, ['invoices']],
    ['facture annulée', () => useInvoiceCancel(1) as never, ['invoices']],
    ['reversement approuvé', () => usePayoutApprove(1) as never, ['payouts']],
    ['reversement versé', () => usePayoutMarkProcessed(1) as never, ['payouts']],
    ['reversement en échec', () => usePayoutMarkFailed(1) as never, ['payouts']],
    ['reversement annulé', () => usePayoutCancel(1) as never, ['payouts']],
    ['commission payée', () => useMarkCommissionPaid() as never, ['commissions']],
    ['commission annulée', () => useCancelCommission() as never, ['commissions']],
    ['intervention acceptée', () => useAcceptMaintenance(1) as never, ['maintenance']],
    ['intervention refusée', () => useDeclineMaintenance(1) as never, ['maintenance']],
    ['bail activé sur papier', () => useActivateLease(1) as never, ['leases', 'detail', 1]],
    ['visite confirmée', () => useConfirmVisit(1) as never, ['visits', 'detail', 1]],
    ['visite menée', () => useCompleteVisit(1) as never, ['visits', 'detail', 1]],
    ['visite manquée', () => useMarkVisitNoShow(1) as never, ['visits', 'detail', 1]],
    ['visite annulée', () => useCancelVisit(1) as never, ['visits', 'detail', 1]],
  ];

  it.each(GESTES)('%s', async (_nom, hook, cle) => {
    const { client, result } = monter(hook, [cle]);

    await act(async () => {
      await result.current.mutateAsync({ id: 1, reason: 'x', contract: new File(['x'], 'c.pdf') } as never)
        .catch(() => undefined);
    });

    expect(envoi).toHaveBeenCalledTimes(1);
    expect(invalidee(client, cle)).toBe(true);
  });
});
