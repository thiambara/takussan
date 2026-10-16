/**
 * TCK-649 (ADR-0064 §1) — **une écriture invalide la page qui l'affiche, à son adresse actuelle.**
 *
 * Les pages d'administration de l'agence ont quitté leur ancienne console pour `/app/agency/*`. Un
 * `revalidatePath` resté sur l'ancienne adresse ne lève rien et ne casse aucun rendu : il invalide
 * une route qui n'existe plus, et la page réelle continue d'être servie depuis son cache —
 * l'enregistrement « réussit », l'écran montre l'ancienne valeur.
 *
 * Le chemin attendu n'est pas recopié à la main : il est lu dans la table des pages
 * (`PAGES_ADMIN`). Si la page change encore d'adresse, ce test suit la table et rougit sur
 * l'action restée en arrière.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PAGES_ADMIN } from '@/lib/access/pages-admin';

const { apiRequestMock, revalidatePathMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, apiRequest: (...args: unknown[]) => apiRequestMock(...args) };
});
vi.mock('next/cache', () => ({ revalidatePath: (chemin: string) => revalidatePathMock(chemin) }));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/lib/session', () => ({
  getToken: async () => 'jeton-de-test',
  getActiveProfileId: async () => undefined,
}));

const agence = await import('@/app/actions/admin-agency');
const reglages = await import('@/app/actions/admin-settings');

/** Le chemin de la page de la table dont la clé de menu est `cle`. */
function cheminDeLaTable(cle: string): string {
  const page = PAGES_ADMIN.find((p) => p.menu?.cle === cle);
  if (!page) throw new Error(`aucune page de menu « ${cle} » dans PAGES_ADMIN`);
  return page.chemin;
}

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue({ data: { id: 1 } });
  revalidatePathMock.mockReset();
});

describe('TCK-649 — les écritures invalident la page à son adresse de `/app/agency`', () => {
  it.each([
    ['updateAgencyAction', () => agence.updateAgencyAction(7, {} as never)],
    ['confirmPayoutThresholdAction', () => agence.confirmPayoutThresholdAction(7, null)],
  ])('%s invalide la configuration de l’agence', async (_nom, appel) => {
    await expect(appel()).resolves.toMatchObject({ ok: true });

    expect(revalidatePathMock).toHaveBeenCalledWith(cheminDeLaTable('agency'));
    expect(revalidatePathMock).toHaveBeenCalledWith('/app/agency');
  });

  it.each([
    ['createIntegrationAction', () => reglages.createIntegrationAction({ provider: 'wave', credentials: {} } as never)],
    ['updateIntegrationAction', () => reglages.updateIntegrationAction(1, {})],
    ['deleteIntegrationAction', () => reglages.deleteIntegrationAction(1)],
  ])('%s invalide la page des intégrations', async (_nom, appel) => {
    await expect(appel()).resolves.toMatchObject({ ok: true });

    expect(revalidatePathMock).toHaveBeenCalledWith(cheminDeLaTable('integrations'));
    expect(revalidatePathMock).toHaveBeenCalledWith('/app/agency/integrations');
  });

  it('aucune action n’invalide une adresse de l’ancienne console', async () => {
    await agence.updateAgencyAction(7, {} as never);
    await reglages.updateIntegrationAction(1, {});

    const chemins = revalidatePathMock.mock.calls.map(([chemin]) => String(chemin));
    expect(chemins.length).toBeGreaterThan(0);
    expect(chemins.filter((c) => c === '/admin' || c.startsWith('/admin/'))).toEqual([]);
  });
});
