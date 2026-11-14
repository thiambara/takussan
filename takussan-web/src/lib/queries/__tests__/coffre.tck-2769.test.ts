/**
 * TCK-2769 — la recherche du coffre part au serveur : `filter[search]`, `page` et `per_page` sur
 * `GET /api/me/document-vault`, sous une clé qui porte la requête et la page ; rien ne part sans requête.
 */
import { describe, expect, it, vi } from 'vitest';

import { buildQueryString } from '@/lib/api';

const appels: { cle: unknown; chemin: string; options: Record<string, unknown> }[] = [];
vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: (cle: unknown, chemin: string, options: Record<string, unknown>) => {
    appels.push({ cle, chemin, options });
    return {};
  },
}));

import { coffreQueryKeys, useRechercheDansLeCoffre } from '../coffre';

describe('TCK-2769 — useRechercheDansLeCoffre', () => {
  it('envoie filter[search], page et per_page au coffre, sous une clé propre à la requête et à la page', () => {
    useRechercheDansLeCoffre('quittance de mars', 2);
    const { cle, chemin, options } = appels.at(-1)!;
    expect(chemin).toBe('/api/me/document-vault');
    expect(cle).toEqual(['documents', 'coffre', 'recherche', 'quittance de mars', 2]);
    expect(options.enabled).toBe(true);
    expect(decodeURIComponent(buildQueryString(options.params as never))).toBe('filter[search]=quittance+de+mars&page=2&per_page=20');
    // Une invalidation du coffre (`coffreQueryKeys.all`) emporte aussi ses recherches.
    expect((cle as readonly unknown[]).slice(0, 2)).toEqual([...coffreQueryKeys.all]);
  });

  it('ne part pas sans requête', () => {
    useRechercheDansLeCoffre('', 1);
    expect(appels.at(-1)!.options.enabled).toBe(false);
  });
});
