/**
 * TCK-650 (ADR-0055 §6) — **la console agit au jeton de l'opérateur, même pendant une impersonation.**
 *
 * Les paramètres globaux et les étiquettes de `/super-admin` passaient par des actions qui lisent
 * `getToken()`, donc le cookie d'impersonation d'abord : pendant une session, l'opérateur y lisait
 * et y écrivait en tant que la cible. Les paramètres globaux ont quitté le module avec leur écran
 * (TCK-651, ADR-0065) ; restent les étiquettes.
 *
 * Le seul maillon doublé est `apiRequest`, plus le magasin de cookies de `next/headers` : les
 * actions, `lib/session` et les modules de requêtes sont les VRAIS. Les DEUX cookies sont posés —
 * c'est le cas où les deux jetons divergent, et le seul où le défaut se voit.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { IMPERSONATION_COOKIE } from '@/lib/impersonation';
import { ACTIVE_PROFILE_COOKIE } from '@/lib/profiles';

const apiRequestMock = vi.fn();

vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, apiRequest: (...args: unknown[]) => apiRequestMock(...args) };
});
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());

const COOKIES: Record<string, string> = {
  [AUTH_COOKIE_NAME]: 'jeton-operateur',
  [IMPERSONATION_COOKIE]: 'jeton-cible',
  [ACTIVE_PROFILE_COOKIE]: 'profil-operateur',
};
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nom: string) => (nom in COOKIES ? { name: nom, value: COOKIES[nom] } : undefined),
  }),
}));

const console_ = await import('@/app/actions/console');
const tagsApp = await import('@/app/actions/admin-tags');

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue({ data: { id: 1 }, meta: { total: 0 } });
});

function optionsDuPremierAppel(): Record<string, unknown> {
  expect(apiRequestMock).toHaveBeenCalledTimes(1);
  return apiRequestMock.mock.calls[0][1] as Record<string, unknown>;
}

const LES_ACTIONS: readonly (readonly [string, () => Promise<unknown>])[] = [
  ['fetchConsoleTagsAction', () => console_.fetchConsoleTagsAction({})],
  ['createConsoleTagAction', () => console_.createConsoleTagAction({ name: 'Piscine' } as never)],
  ['updateConsoleTagAction', () => console_.updateConsoleTagAction(1, {})],
  ['deleteConsoleTagAction', () => console_.deleteConsoleTagAction(1)],
];

describe('TCK-650 — la console, pendant une impersonation', () => {
  it.each(LES_ACTIONS)("%s porte le jeton de l'opérateur, pas celui de la cible", async (_nom, appel) => {
    await expect(appel()).resolves.toMatchObject({ ok: true });

    expect(optionsDuPremierAppel().token).toBe('jeton-operateur');
  });

  it('ne laisse aucune action du module hors de la table', () => {
    const exportees = Object.keys(console_).filter((n) => n.endsWith('Action'));

    expect([...exportees].sort()).toEqual(LES_ACTIONS.map(([nom]) => nom).sort());
  });
});

/**
 * La moitié qui empêche le mauvais correctif : basculer `admin-tags.ts` entier à l'opérateur
 * aurait mis les formulaires de bien de `/app` hors de la cible, que l'impersonation montre.
 */
describe("TCK-650 — l'espace applicatif, lui, lit toujours en tant que la cible", () => {
  it('fetchTagsAction (formulaires de bien de /app) porte le jeton de la cible', async () => {
    await tagsApp.fetchTagsAction({});

    expect(optionsDuPremierAppel().token).toBe('jeton-cible');
  });
});
