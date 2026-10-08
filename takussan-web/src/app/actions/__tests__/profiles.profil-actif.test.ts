/**
 * TCK-600 (invariant 11, verif-600 O1) — pendant une impersonation, `getMyProfilesAction` parle à
 * l'API avec le jeton de la CIBLE : le profil actif de l'opérateur ne l'accompagne jamais.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pot = vi.hoisted(() => ({ cookies: {} as Record<string, string> }));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nom: string) => (pot.cookies[nom] !== undefined ? { value: pot.cookies[nom] } : undefined),
    set: vi.fn(),
  }),
}));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (cle: string) => cle }));

const fetchMyProfiles = vi.hoisted(() => vi.fn());
vi.mock('@/lib/profiles', async (original) => ({
  ...(await original<typeof import('@/lib/profiles')>()),
  fetchMyProfiles,
}));

import { getMyProfilesAction } from '../profiles';

describe('getMyProfilesAction — profil actif', () => {
  beforeEach(() => {
    fetchMyProfiles.mockReset().mockResolvedValue({ data: [] });
  });

  it('pendant une session : jeton de la cible, AUCUN profil de l\'opérateur', async () => {
    pot.cookies = { auth_token: 'jeton-operateur', active_profile_id: 'platform:7', impersonation_token: '42|imp' };

    await getMyProfilesAction();

    expect(fetchMyProfiles).toHaveBeenCalledWith('42|imp', undefined);
  });

  it('hors session : le jeton et le profil actif de l\'utilisateur', async () => {
    pot.cookies = { auth_token: 'jeton-utilisateur', active_profile_id: 'agent:3' };

    await getMyProfilesAction();

    expect(fetchMyProfiles).toHaveBeenCalledWith('jeton-utilisateur', 'agent:3');
  });
});
