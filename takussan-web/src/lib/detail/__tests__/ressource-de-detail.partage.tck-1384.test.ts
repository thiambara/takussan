/**
 * TCK-1384 (P138.04) — la sonde d'existence partage sa promesse avec la page, là où la page lit
 * la ressource au serveur (`properties`, `customers`) : une seule lecture de la fiche par rendu.
 * Ailleurs, la sonde lit le `show` sans `fields[...]`, que l'API ignore (P60.03).
 *
 * Avant : `/app/properties/5` lisait `GET /api/properties/5?fields[properties]=id` (layout) puis
 * `GET /api/properties/5` (page) ; `/app/customers/5` de même, avec `?include=documents,tags`.
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
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

import * as detail from '../ressource-de-detail';
import { ApiError } from '@/lib/api';

/** Les lectures de page partagées, par segment : le nom de la fonction que la page appelle. */
const LECTURES = { properties: 'lireBienDuRendu', customers: 'lireClientDuRendu' } as const;

beforeEach(() => {
  caches.forEach((vider) => vider());
  apiRequest.mockReset();
  apiRequest.mockResolvedValue({ data: { id: 5 } });
});

describe('TCK-1384 — la sonde et la page lisent une fois', () => {
  it.each(Object.entries(LECTURES))('%s : exigerRessource puis la lecture de la page → un appel', async (segment, nom) => {
    const lire = (detail as unknown as Record<string, (t: string, id: number) => Promise<unknown>>)[nom];
    expect(lire, `${nom} n'est pas exportée`).toBeTypeOf('function');

    await detail.exigerRessource(segment as detail.SegmentDeDetail, '5');
    await expect(lire('jeton', 5)).resolves.toEqual({ id: 5 });
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it('un 403 de la lecture partagée n’est pas un introuvable, et la page le reçoit', async () => {
    apiRequest.mockRejectedValue(new ApiError(403, {}));
    await expect(detail.exigerRessource('properties', '5')).resolves.toBe(5);
    const lire = (detail as unknown as Record<string, (t: string, id: number) => Promise<unknown>>).lireBienDuRendu;
    await expect(lire('jeton', 5)).rejects.toMatchObject({ status: 403 });
  });

  it('ailleurs, la sonde lit le show sans fields[...]', async () => {
    await detail.sonderExistence('leases', 9);
    expect(apiRequest.mock.calls[0][0]).toBe('/api/leases/9');
  });
});
