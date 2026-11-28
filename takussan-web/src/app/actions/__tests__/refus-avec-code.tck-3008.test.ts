/**
 * TCK-3008 — une server action en échec rend le CODE métier et les paramètres du refus à côté du message : sans eux,
 * l'écran qui reçoit `{ok: false, message}` ne peut choisir un geste que par la prose. Deux formes de module :
 * celle à `mapError` (clients) et celle qui relayait `(err as Error).message` (indicateurs).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@/lib/api';
import { createCustomerAction } from '../dashboard-customers';
import { createKpiConfigAction } from '../kpis';

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton-de-test' }));

const createCustomerMock = vi.fn();
vi.mock('@/lib/queries/customers', () => ({
  attachCustomerTags: vi.fn(),
  createCustomer: (...a: unknown[]) => createCustomerMock(...a),
  createCustomerNote: vi.fn(),
  detachCustomerTag: vi.fn(),
  updateCustomer: vi.fn(),
}));

const apiRequestMock = vi.fn();
vi.mock('@/lib/api', async (reel) => ({
  ...(await reel<typeof import('@/lib/api')>()),
  apiRequest: (...a: unknown[]) => apiRequestMock(...a),
}));

describe('le résultat d’échec d’une server action porte le code du refus (TCK-3008)', () => {
  beforeEach(() => {
    createCustomerMock.mockReset();
    apiRequestMock.mockReset();
  });

  it('createCustomerAction : code et params à côté du message localisé', async () => {
    createCustomerMock.mockRejectedValue(
      new ApiError(422, { code: 'customer.limit_reached', message: 'Limite atteinte.', params: { max: 500 } }),
    );
    const result = await createCustomerAction({ first_name: 'Awa' } as never);
    expect(result).toMatchObject({ ok: false, status: 422, message: 'Limite atteinte.', code: 'customer.limit_reached', params: { max: 500 } });
  });

  it('un refus sans code n’en invente pas', async () => {
    createCustomerMock.mockRejectedValue(new ApiError(500, { message: 'Panne serveur' }));
    const result = await createCustomerAction({ first_name: 'Awa' } as never);
    expect(result).not.toHaveProperty('code');
    expect(result).not.toHaveProperty('params');
  });

  it('createKpiConfigAction ne relaie plus « API error 422 » : le message de l’API et son code', async () => {
    apiRequestMock.mockRejectedValue(new ApiError(422, { code: 'kpi.duplicate', message: 'Cet indicateur existe déjà.' }));
    const result = await createKpiConfigAction({} as never);
    expect(result).toEqual({ ok: false, message: 'Cet indicateur existe déjà.', code: 'kpi.duplicate' });
  });
});
