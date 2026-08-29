/**
 * TCK-442 — **la sonde d'existence, et les trois issues qu'elle refuse de confondre.**
 *
 * AC4 du ticket : *« au moins une des huit pages traduit un 404 de l'API en introuvable, et un test
 * l'éprouve. Sans ça, ce ticket rend un statut juste à un cas (`id` illisible) qui n'est pas celui
 * que rencontre un utilisateur. »* C'est ce fichier, et il l'éprouve pour les huit d'un coup —
 * l'inventaire des segments est dérivé du système de fichiers, jamais écrit.
 *
 * ⚠ Le test le plus important de ce fichier n'est pas le 404 : c'est le **500**. Un
 * `try { … } catch { notFound() }` cocherait l'AC4 et réintroduirait le soft-404 que TCK-335 a payé
 * en production sur le catalogue public — « ce bien n'existe pas » servi pour une API éteinte.
 * *Une garde qui n'éprouve que le cas nominal accepte le mauvais correctif.*
 */
import { readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.fn();
const getTokenMock = vi.fn<() => Promise<string | undefined>>();

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));

vi.mock('@/lib/session', () => ({ getToken: () => getTokenMock() }));

vi.mock('next/navigation', () => ({
  // `notFound()` de Next ne rend pas : il lève. Le double fait pareil, sinon l'appelant
  // continuerait après l'appel et le test verrait un chemin que la production ne produit jamais.
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const { ApiError } = await import('@/lib/api');
const { RESSOURCES_DE_DETAIL, exigerRessource, idDeDetail, sonderExistence } = await import(
  '../ressource-de-detail'
);

type Segment = keyof typeof RESSOURCES_DE_DETAIL;
const SEGMENTS = Object.keys(RESSOURCES_DE_DETAIL) as Segment[];

/** Les segments `[id]` réellement posés sous `/app` — l'inventaire dérivé, jamais recopié. */
function segmentsDeDetailSurDisque(): string[] {
  const APP = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    'app',
    '(dashboard)',
    'app',
  );
  return readdirSync(APP, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(APP, e.name, '[id]', 'page.tsx')))
    .map((e) => e.name)
    .sort();
}

beforeEach(() => {
  apiRequestMock.mockReset();
  getTokenMock.mockReset();
  getTokenMock.mockResolvedValue('jeton');
});

describe('TCK-442 — la table des ressources de détail', () => {
  it('couvre EXACTEMENT les segments [id] posés sous /app (non-vacuité et exhaustivité)', () => {
    const surDisque = segmentsDeDetailSurDisque();
    expect(surDisque.length).toBeGreaterThanOrEqual(8);
    // Dans les deux sens : un segment de détail neuf sans entrée ici n'aurait pas de sonde, et une
    // entrée sans segment décrirait une route disparue.
    expect(SEGMENTS.sort()).toEqual(surDisque);
  });

  it('lit le bon chemin d’API et la bonne table spatie pour chaque segment', async () => {
    for (const segment of SEGMENTS) {
      apiRequestMock.mockReset();
      apiRequestMock.mockResolvedValue({ data: { id: 7 } });
      // ⚠ `sonderExistence` est mémoïsé par `cache()` : un id différent par segment, sinon le
      // deuxième appel rendrait la réponse du premier et ce test ne mesurerait qu'une ligne.
      await sonderExistence(segment, 7 + SEGMENTS.indexOf(segment));

      const { api, table } = RESSOURCES_DE_DETAIL[segment];
      const chemin = apiRequestMock.mock.calls[0]?.[0] as string;
      expect(chemin, `${segment} n'a pas interrogé /api/${api}`).toMatch(
        new RegExp(`^/api/${api}/\\d+\\?`),
      );
      expect(chemin, `${segment} ne demande pas fields[${table}]`).toContain(`fields[${table}]=id`);
    }
  });
});

describe('TCK-442 / AC4 — un 404 de l’API devient un introuvable, une panne JAMAIS', () => {
  it('404 → introuvable', async () => {
    apiRequestMock.mockRejectedValue(new ApiError(404, { message: 'Not Found' }));
    await expect(exigerRessource('leases', '4041')).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('500 → PAS introuvable : on ne dit pas qu’une ressource n’existe pas quand on l’ignore', async () => {
    apiRequestMock.mockRejectedValue(new ApiError(500, { message: 'Server error' }));
    await expect(exigerRessource('leases', '5001')).resolves.toBe(5001);
  });

  it('403 → PAS introuvable : « pas le vôtre » n’est pas « n’existe pas »', async () => {
    apiRequestMock.mockRejectedValue(new ApiError(403, { message: 'Forbidden' }));
    await expect(exigerRessource('leases', '4031')).resolves.toBe(4031);
  });

  it('une panne réseau nue (pas une ApiError) → PAS introuvable', async () => {
    apiRequestMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(exigerRessource('leases', '5991')).resolves.toBe(5991);
  });

  it('sans jeton, la question n’a pas de réponse — et l’API n’est pas interrogée', async () => {
    getTokenMock.mockResolvedValue(undefined);
    await expect(sonderExistence('leases', 12_345)).resolves.toBe('indecidable');
    expect(apiRequestMock).not.toHaveBeenCalled();
  });
});

describe('TCK-442 — l’identifiant illisible, l’autre moitié du défaut', () => {
  it.each([
    ['abc', 'lettres'],
    ['', 'vide'],
    ['0', 'zéro'],
    ['-3', 'négatif'],
    ['1.5', 'non entier — Number.isFinite l’acceptait, Number.isInteger non'],
  ])('« %s » n’est pas un identifiant (%s)', (brut) => {
    expect(idDeDetail(brut)).toBeNull();
  });

  it('« 42 » en est un', () => {
    expect(idDeDetail('42')).toBe(42);
  });

  it('un identifiant illisible lève l’introuvable SANS interroger l’API', async () => {
    await expect(exigerRessource('bookings', 'abc')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(apiRequestMock).not.toHaveBeenCalled();
  });
});
