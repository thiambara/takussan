// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

/**
 * TCK-598, après verif-598 (m2) — `encodeURIComponent` n'encode pas `.` : `getProperty('.')`
 * appelait `GET /api/public/properties/`, la LISTE du catalogue, et la mettait en cache sous
 * l'étiquette `property:.` ; `getEtatDuBien('..')` appelait `/api/public/status`. Un slug hors de
 * la forme d'un slug de bien est un bien introuvable, sans appel.
 */
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));

import { getEtatDuBien, getProperty } from '../public-property';

let fetchSpy: MockInstance<typeof fetch>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () => new Response(JSON.stringify({ data: { slug: 'x' } }), { status: 200 }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('m2 — `.`, `..` et `../x` ne déclenchent aucun appel', () => {
  it.each(['.', '..', '../x', 'a/b', ''])('getProperty(%j) → introuvable', async (slug) => {
    expect(await getProperty(slug, 'fr')).toEqual({ etat: 'introuvable' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each(['.', '..', '../x', 'a/b', ''])('getEtatDuBien(%j) → null', async (slug) => {
    expect(await getEtatDuBien(slug, 'fr')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('un slug de bien, même commençant par `-`, est lu sur son propre chemin', async () => {
    await getProperty('-abc123', 'fr');
    expect(new URL(String(fetchSpy.mock.calls[0]![0])).pathname).toBe('/api/public/properties/-abc123');
  });
});
