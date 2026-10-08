// @vitest-environment node
/**
 * TCK-509 (AC6) — la déconnexion efface `active_profile_id`, quel que soit le chemin.
 *
 * `logoutAction` (server action) passait par `clearToken()`, qui efface les deux cookies ; ce
 * route handler, lui, n'effaçait que `auth_token`. Le profil actif est lié à une session : le
 * laisser survivre fait transmettre au résolveur un identifiant de profil qui n'appartient plus à
 * personne. `set-token` le rattrapait à la connexion suivante — un correctif par la porte d'à côté.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logoutMock = vi.fn().mockResolvedValue(undefined);

const cookiesPresents = vi.hoisted((): Record<string, string> => ({}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nom: string) => (nom in cookiesPresents ? { value: cookiesPresents[nom] } : undefined),
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
  beforeEach(() => {
    for (const nom of Object.keys(cookiesPresents)) delete cookiesPresents[nom];
    Object.assign(cookiesPresents, { auth_token: 'jeton-A', active_profile_id: 'agent:5' });
    logoutMock.mockClear();
    vi.unstubAllGlobals();
  });

  it('révoque le jeton côté API puis efface auth_token, active_profile_id et la session d\'impersonation', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await POST();

    expect(logoutMock).toHaveBeenCalledWith('jeton-A');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(effaces(res).sort()).toEqual(['active_profile_id', 'auth_token', 'impersonation_active', 'impersonation_token']);
  });

  /** TCK-600 (ADR-0055 §6) — la déconnexion de l'opérateur ferme sa session d'impersonation. */
  it('pendant une impersonation, ferme la session avec le jeton de l\'OPÉRATEUR avant de révoquer', async () => {
    cookiesPresents.impersonation_token = 'jeton-imp';
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await POST();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/admin\/impersonate\/stop$/),
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer jeton-A' }) }),
    );
    expect(effaces(res)).toEqual(expect.arrayContaining(['impersonation_token', 'impersonation_active']));
  });
});
