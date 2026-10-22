// @vitest-environment node
/**
 * TCK-1481 (P113.05) — le relais de déconnexion borne son attente de l'API et efface quand même.
 *
 * Lu le 2026-10-22 : le relais attendait `impersonate/stop` sans aucune borne, puis `auth/logout`
 * jusqu'aux 30 s de TCK-1215, avant d'effacer les cookies. Sur une API figée, la session restait
 * ouverte dans les cookies. Décision du porteur : attente bornée à quelques secondes, effacement
 * quand même.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cookiesPresents = vi.hoisted((): Record<string, string> => ({}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nom: string) => (nom in cookiesPresents ? { value: cookiesPresents[nom] } : undefined),
  }),
}));

/** Un appel qui ne répond jamais, et ne rejette qu'à l'abandon de son signal. */
function figé(signal: AbortSignal | null | undefined): Promise<never> {
  return new Promise((_, rejeter) => {
    signal?.addEventListener('abort', () => rejeter(new DOMException('abandon', 'AbortError')));
  });
}

const logoutMock = vi.fn((_token: string, signal?: AbortSignal) => figé(signal));
vi.mock('@/lib/auth', () => ({
  logout: (token: string, signal?: AbortSignal) => logoutMock(token, signal),
}));

const { POST } = await import('../route');
const { DELAI_DECONNEXION_API_MS } = await import('@/lib/delais-deconnexion');

const effaces = (res: Response) =>
  res.headers
    .getSetCookie()
    .filter((c) => /expires=Thu, 01 Jan 1970/i.test(c) || /max-age=0/i.test(c))
    .map((c) => c.split('=')[0]);

describe('POST /api/auth/logout — API figée (TCK-1481)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    for (const nom of Object.keys(cookiesPresents)) delete cookiesPresents[nom];
    Object.assign(cookiesPresents, {
      auth_token: 'jeton-A',
      active_profile_id: 'agent:5',
      impersonation_token: 'jeton-imp',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => figé(init?.signal)),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('une seule échéance de quelques secondes pour les deux appels, puis les cookies effacés', async () => {
    expect(DELAI_DECONNEXION_API_MS).toBeLessThanOrEqual(5_000);

    let rendu: Response | null = null;
    void POST().then((r) => {
      rendu = r;
    });

    await vi.advanceTimersByTimeAsync(DELAI_DECONNEXION_API_MS - 1);
    expect(rendu).toBeNull();
    await vi.advanceTimersByTimeAsync(1);

    expect(rendu).not.toBeNull();
    expect(effaces(rendu!).sort()).toEqual([
      'active_profile_id',
      'auth_token',
      'impersonation_active',
      'impersonation_token',
    ]);
    // La révocation reste tentée, avec le jeton de la session.
    expect(logoutMock).toHaveBeenCalledWith('jeton-A', expect.any(AbortSignal));
  });
});
