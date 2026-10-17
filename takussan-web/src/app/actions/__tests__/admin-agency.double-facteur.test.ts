/**
 * TCK-761 (P15.04) — `admin-agency.ts` rend le `code` d'un refus de second facteur, comme
 * `admin-settings.ts` depuis TCK-293. Une action serveur ne transmet pas d'`ApiError` : sans ce
 * code, `AgencyConfigForm` ne peut pas confier le refus à `GardeDoubleFacteur`, et l'admin d'agence
 * sans 2FA lit une erreur de formulaire au lieu de la boîte qui la lui fait configurer.
 *
 * Seul `apiRequest` est doublé : l'action et le module de requêtes sont les vrais.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.fn();

vi.mock('@/lib/api', async () => ({
  ...(await vi.importActual<typeof import('@/lib/api')>('@/lib/api')),
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/lib/session', () => ({
  getToken: async () => 'jeton-de-test',
  getActiveProfileId: async () => 'profil-agence-7',
}));

const actions = await import('@/app/actions/admin-agency');
const { ApiError } = await import('@/lib/api');

beforeEach(() => apiRequestMock.mockReset());

describe('admin-agency — le refus de second facteur garde son code', () => {
  it.each([
    ['updateAgencyAction', () => actions.updateAgencyAction(7, { name: 'Dakar Immo' } as never)],
    ['confirmPayoutThresholdAction', () => actions.confirmPayoutThresholdAction(7, 100000)],
  ])('%s : `code` sur un 403 de second facteur, rien sur un autre refus', async (_nom, lancer) => {
    apiRequestMock.mockRejectedValueOnce(new ApiError(403, { code: 'two_factor_required' }));
    await expect(lancer()).resolves.toMatchObject({ ok: false, status: 403, code: 'two_factor_required' });

    apiRequestMock.mockRejectedValueOnce(new ApiError(403, { message: 'Accès refusé.' }));
    const autre = await lancer();
    expect(autre).toMatchObject({ ok: false, status: 403 });
    expect(autre).not.toHaveProperty('code');
  });
});
