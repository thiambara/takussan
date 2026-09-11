// @vitest-environment node
/**
 * TCK-509 (AC6) — la déconnexion efface `active_profile_id`, quel que soit le chemin.
 *
 * `logoutAction` (server action) passait par `clearToken()`, qui efface les deux cookies ; ce
 * route handler, lui, n'effaçait que `auth_token`. Le profil actif est lié à une session : le
 * laisser survivre fait transmettre au résolveur un identifiant de profil qui n'appartient plus à
 * personne. `set-token` le rattrapait à la connexion suivante — un correctif par la porte d'à côté.
 */
import { describe, expect, it, vi } from 'vitest';

const logoutMock = vi.fn().mockResolvedValue(undefined);

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nom: string) => (nom === 'auth_token' ? { value: 'jeton-A' } : { value: 'agent:5' }),
  }),
}));

vi.mock('@/lib/auth', () => ({
  logout: (...args: unknown[]) => logoutMock(...args),
}));

const { POST } = await import('../route');

const effaces = (res: Response) =>
  res.headers
    .getSetCookie()
    .filter((c) => /expires=Thu, 01 Jan 1970/i.test(c) || /max-age=0/i.test(c))
    .map((c) => c.split('=')[0]);

describe('POST /api/auth/logout', () => {
  it('révoque le jeton côté API puis efface auth_token ET active_profile_id', async () => {
    const res = await POST();

    expect(logoutMock).toHaveBeenCalledWith('jeton-A');
    expect(effaces(res).sort()).toEqual(['active_profile_id', 'auth_token']);
  });
});
