/**
 * TCK-1378 (P138.05) — `fetchAgencyAction` lit l'agence par la requête mise en cache du rendu
 * (`agenceDuRendu`), celle que le layout de `/app` fait déjà par `resolveAgencyOrNull`.
 *
 * Avant : l'accueil `/app` d'un admin d'agence portait deux `GET /api/agencies/{id}` de même URL et
 * même indice, l'une sous `cache()` (layout), l'autre hors (page, `fetchAgencyAction`).
 *
 * `cache()` de React ne mémoïse que sous `react-server` : il est remplacé ici par une mémoïsation
 * par rendu, celle que Next applique à une requête.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const caches = vi.hoisted((): Array<() => void> => []);
const fetchAgency = vi.fn();

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
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/session', () => ({
  getToken: async () => 'jeton',
  getActiveProfileId: async () => 'agency_admin:12',
}));
vi.mock('@/lib/queries/agencies', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/agencies')>()),
  fetchAgency: (...a: unknown[]) => fetchAgency(...a),
}));

import { fetchAgencyAction } from '../admin-agency';
import { resolveAgencyOrNull } from '@/lib/access/server-guards';
import { ApiError } from '@/lib/api';

const agence = { id: 7, kind: 'standard', logo_url: null };

beforeEach(() => {
  caches.forEach((vider) => vider());
  fetchAgency.mockReset();
  fetchAgency.mockResolvedValue(agence);
});

describe('fetchAgencyAction — l’agence du rendu', () => {
  it('le layout (resolveAgencyOrNull) et la page ne font qu’une lecture de l’agence', async () => {
    await resolveAgencyOrNull('jeton', 7, 'test');
    const resultat = await fetchAgencyAction(7);

    expect(resultat).toEqual({ ok: true, data: agence });
    expect(fetchAgency).toHaveBeenCalledTimes(1);
    expect(fetchAgency).toHaveBeenCalledWith('jeton', 7, 'agency_admin:12');
  });

  it('une erreur de l’API reste rendue à la page, avec son statut', async () => {
    fetchAgency.mockRejectedValue(new ApiError(403, { message: 'interdit' }));
    const resultat = await fetchAgencyAction(7);

    expect(resultat).toMatchObject({ ok: false, status: 403 });
  });
});
