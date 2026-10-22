/**
 * TCK-1380 (P138.06) — `/app/settings/agency/upgrade` ne lit qu'une fois les demandes de passage :
 * le layout de `/app` (carte de la barre latérale) et la page partagent la promesse du rendu.
 *
 * `cache()` de React ne mémoïse que sous `react-server` : il est remplacé ici par une mémoïsation
 * par rendu, celle que Next applique à une requête.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const caches = vi.hoisted((): Array<() => void> => []);
const apiRequest = vi.fn();

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
      const memo = new Map<string, R>();
      caches.push(() => memo.clear());
      return (...args: A): R => {
        const cle = JSON.stringify(args);
        if (!memo.has(cle)) memo.set(cle, fn(...args));
        return memo.get(cle) as R;
      };
    },
  };
});
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...a: unknown[]) => apiRequest(...a),
}));

import { fetchAgencyUpgradeRequests } from '../agency-upgrade';

beforeEach(() => {
  caches.forEach((vider) => vider());
  apiRequest.mockReset();
});

describe('fetchAgencyUpgradeRequests — une lecture par rendu', () => {
  it('le layout et la page partagent la même requête', async () => {
    apiRequest.mockResolvedValue({ data: [], meta: {} });
    await Promise.all([
      fetchAgencyUpgradeRequests('jeton', 1).catch(() => null),
      fetchAgencyUpgradeRequests('jeton', 1),
    ]);
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it('l’avalement d’erreur du layout reste de son côté : la page reçoit l’erreur', async () => {
    apiRequest.mockRejectedValue(new Error('panne'));
    await expect(fetchAgencyUpgradeRequests('jeton', 1).catch(() => null)).resolves.toBeNull();
    await expect(fetchAgencyUpgradeRequests('jeton', 1)).rejects.toThrow('panne');
  });
});
