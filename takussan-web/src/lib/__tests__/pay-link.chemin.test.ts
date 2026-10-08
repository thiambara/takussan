import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-602 × TCK-600 (ADR-0055 §6) — le jeton d'un lien de paiement entre dans le chemin par
 * `cheminApi`, comme toute valeur : un jeton qui porterait `/`, `?`, `#` ou `..` est REFUSÉ, et
 * aucun appel ne part. La garde statique (`chemin-api.garde.test.ts`) ne voit pas ces appels — leur
 * gabarit ne commence pas par `/api` (`apiFetch` l'ajoute) —, d'où ce test.
 */
const apiFetchMock = vi.fn();
const fetchMock = vi.fn();

vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

const { fetchPayLink, initiatePayLink, verifyPayLink, downloadPayLinkReceipt } = await import('@/lib/queries/pay-link');

const JETON = 'Ab-_0123456789abcdefghijklmnopqrstuvwxyzABC';

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockResolvedValue({ data: {} });
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('lien de paiement — le jeton passe par cheminApi', () => {
  it('compose les quatre chemins du jeton', async () => {
    await fetchPayLink(JETON);
    await initiatePayLink(JETON, 'wave');
    await verifyPayLink(JETON);

    expect(apiFetchMock.mock.calls.map(([chemin]) => chemin)).toEqual([
      `/pay/${JETON}`,
      `/pay/${JETON}/initiate`,
      `/pay/${JETON}/verify`,
    ]);
  });

  it.each(['../admin/users/1/impersonate', 'x?reason=a&b=', 'x#frag', '..', 'a/b'])(
    'refuse « %s » sans appel',
    async (jeton) => {
      for (const appel of [
        () => fetchPayLink(jeton),
        () => initiatePayLink(jeton, 'wave'),
        () => verifyPayLink(jeton),
        () => downloadPayLinkReceipt(jeton),
      ]) {
        await expect(appel()).rejects.toMatchObject({ status: 400, data: { code: 'invalid_path' } });
      }
      expect(apiFetchMock).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
