import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PropertyListItem } from '@/types/property';

const urls: string[] = [];
let reponses: Record<string, PropertyListItem[] | Error> = {};

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiFetch: vi.fn(async (path: string) => {
    urls.push(path);
    const slug = /\/public\/properties\/([^/]+)\/similar/.exec(path)?.[1] ?? '';
    const r = reponses[slug];
    if (r === undefined || r instanceof Error) throw r ?? new Error(`non doublé : ${path}`);
    return { data: r };
  }),
}));

const { useSimilairesDesVus } = await import('../useSimilairesDesVus');

const bien = (id: number) => ({ id, slug: `bien-${id}` }) as PropertyListItem;
const ids = (biens: readonly PropertyListItem[]) => biens.map((b) => b.id);

beforeEach(() => {
  urls.length = 0;
  reponses = {};
});

describe('useSimilairesDesVus', () => {
  it('complète deux biens consultés par les similaires de chacun, sans doublon', async () => {
    reponses = { 'bien-1': [bien(2), bien(10), bien(11)], 'bien-2': [bien(10), bien(20)] };
    const vus = [bien(1), bien(2)];

    const { result } = renderHook(() => useSimilairesDesVus(vus, true));

    // À tour de rôle : 2 (déjà vu) écarté, 10, puis 20 (bien-2), puis 11 (le 10 de bien-2 est un doublon).
    await waitFor(() => expect(ids(result.current)).toEqual([10, 20, 11]));
    // Dix cartes manquent pour une rangée de douze : c'est la limite demandée à chaque source.
    expect(urls.sort()).toEqual([
      '/public/properties/bien-1/similar?limit=10',
      '/public/properties/bien-2/similar?limit=10',
    ]);
  });

  it('une source en panne tombe seule', async () => {
    reponses = { 'bien-1': new Error('500'), 'bien-2': [bien(20)] };
    const vus = [bien(1), bien(2)];

    const { result } = renderHook(() => useSimilairesDesVus(vus, true));

    await waitFor(() => expect(ids(result.current)).toEqual([20]));
  });

  it('ne lit les similaires que des trois biens consultés les plus récents', async () => {
    reponses = { 'bien-1': [], 'bien-2': [], 'bien-3': [], 'bien-4': [bien(40)] };
    const vus = [bien(1), bien(2), bien(3), bien(4)];

    renderHook(() => useSimilairesDesVus(vus, true));

    await waitFor(() => expect(urls).toHaveLength(3));
    expect(urls.some((u) => u.includes('bien-4'))).toBe(false);
  });

  it('inactive, ou rangée déjà pleine : aucune requête', async () => {
    const pleine = Array.from({ length: 12 }, (_, i) => bien(i + 1));
    const deux = [bien(1), bien(2)];

    const inactif = renderHook(() => useSimilairesDesVus(deux, false));
    const plein = renderHook(() => useSimilairesDesVus(pleine, true));
    await new Promise((r) => setTimeout(r, 20));

    expect(urls).toEqual([]);
    expect(inactif.result.current).toEqual([]);
    expect(plein.result.current).toEqual([]);
  });
});
