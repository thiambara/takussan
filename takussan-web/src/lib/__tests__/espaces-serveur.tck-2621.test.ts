/**
 * TCK-2621 — `espacesAChoisir` : ce que le layout de `/app` lit avant de rendre la coque, et quand il
 * ne lit RIEN (un compte lié ne paie aucune requête de plus).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyProfilesResponse } from '@/types/profile';
import type { User } from '@/types/user';

const session = { impersonation: false, choixClient: undefined as string | undefined, token: 'jeton' as string | undefined };
vi.mock('@/lib/session', () => ({
  estEnImpersonation: async () => session.impersonation,
  getChoixClient: async () => session.choixClient,
  getToken: async () => session.token,
}));
const fetchMyProfiles = vi.fn();
vi.mock('@/lib/profiles', () => ({ fetchMyProfiles: (...a: unknown[]) => fetchMyProfiles(...a) }));

import { espacesAChoisir } from '@/lib/espaces-serveur';

const DEUX: MyProfilesResponse = {
  data: [
    { id: 'agent:5', type: 'agent', numeric_id: 5, agency_id: 1, agency: { id: 1, name: 'Dakar Immo', slug: 'd', kind: 'standard' }, status: 'active', created_at: null },
    { id: 'owner:9', type: 'owner', numeric_id: 9, agency_id: 2, agency: { id: 2, name: 'Thiès Properties', slug: 't', kind: 'standard' }, status: 'active', created_at: null },
  ],
  meta: { active_profile_id: null, count: 2 },
};
const compte = (lie: string | null) => ({ id: 176, active_profile_id: lie }) as unknown as User;

beforeEach(() => {
  Object.assign(session, { impersonation: false, choixClient: undefined, token: 'jeton' });
  fetchMyProfiles.mockReset().mockResolvedValue(DEUX);
});

describe('espacesAChoisir', () => {
  it('deux agences, rien de lié : les deux espaces', async () => {
    expect((await espacesAChoisir(compte(null)))?.map((p) => p.id)).toEqual(['agent:5', 'owner:9']);
  });

  it('un profil lié : null, et la liste des profils n’est pas lue', async () => {
    expect(await espacesAChoisir(compte('owner:9'))).toBeNull();
    expect(fetchMyProfiles).not.toHaveBeenCalled();
  });

  it('en impersonation : null, sans lecture', async () => {
    session.impersonation = true;
    expect(await espacesAChoisir(compte(null))).toBeNull();
    expect(fetchMyProfiles).not.toHaveBeenCalled();
  });

  it('après « Continuer en tant que client » : null pour ce compte', async () => {
    session.choixClient = '176';
    expect(await espacesAChoisir(compte(null))).toBeNull();
    expect(fetchMyProfiles).not.toHaveBeenCalled();
  });

  it('une seule agence : null', async () => {
    fetchMyProfiles.mockResolvedValue({ ...DEUX, data: DEUX.data.map((p) => ({ ...p, agency_id: 1 })) });
    expect(await espacesAChoisir(compte(null))).toBeNull();
  });

  it('une lecture en échec : null (la coque, jamais une page d’erreur)', async () => {
    fetchMyProfiles.mockRejectedValue(new Error('injoignable'));
    expect(await espacesAChoisir(compte(null))).toBeNull();
  });
});
