import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToReadableStream } from 'react-dom/server';
import type { ReactElement } from 'react';

import type { SearchResult } from '@/types/search';

/**
 * TCK-916 (P35.02) — la page de ville passe les liens « Quartiers de <ville> » à la liste.
 *
 * Même capteur que `cablage-de-la-page.test.tsx` : ce que la page PASSE à `PropertiesDiscoveryPage`.
 * Le rendu du bloc lui-même est éprouvé par `QuartiersDeLaVille.test.tsx`, et la présence de
 * chaque lien au sitemap par `lib/__tests__/liens-de-lieu.test.ts`.
 */
type Liens = ReactElement<{ ville: string; liens: readonly { libelle: string; href: string }[] }>;
let liensVus: Liens | null | undefined;

vi.mock('@/components/property/PropertiesDiscoveryPage', () => ({
  PropertiesDiscoveryPage: (props: { liensDeLieu?: Liens | null }) => {
    liensVus = props.liensDeLieu;
    return null;
  },
}));

const villes = new Map([['dakar', 'Dakar']]);
vi.mock('@/lib/queries/facettes', async (importOriginal) => {
  const { domainesStatiques } = await import('@/lib/canonique');
  return {
    ...(await importOriginal<typeof import('@/lib/queries/facettes')>()),
    villesDuCatalogue: async () => villes,
    domainesDeLaListe: async (params: URLSearchParams) => ({
      ...domainesStatiques(),
      villes,
      quartiers: params.get('location') ? new Map([['mermoz', 'Mermoz']]) : null,
    }),
    quartiersDeLaVille: async () => new Map([['mermoz', 'Mermoz']]),
    compteDuLieu: async () => undefined,
  };
});

vi.mock('@/lib/queries/public-search', () => ({
  rechercherBiensPublics: async () =>
    ({ data: [], meta: { current_page: 1, last_page: 1, per_page: 30, total: 4 } }) as unknown as SearchResult,
}));

vi.mock('next-intl/server', () => ({
  getLocale: async () => 'fr',
  getTranslations: async (namespace?: string) =>
    Object.assign((cle: string) => `${namespace}.${cle}`, { has: () => true }),
}));

const { default: PageDeLaListe } = await import('../page');

async function rendre(searchParams: Record<string, string>) {
  const flux = await renderToReadableStream(await PageDeLaListe({ searchParams: Promise.resolve(searchParams) }));
  await flux.allReady;
  const lecteur = flux.getReader();
  for (;;) if ((await lecteur.read()).done) break;
}

beforeEach(() => {
  liensVus = undefined;
});

describe('TCK-916 — les quartiers de la ville, passés à la liste', () => {
  it.each([[{ city: 'dakar' }], [{ city: 'Dakar', contract_type: 'rent' }]])(
    'page de ville %o : les liens des quartiers, ville du catalogue',
    async (requete) => {
      await rendre(requete);
      expect(liensVus?.props.ville).toBe('Dakar');
      expect(liensVus?.props.liens).toEqual([
        { libelle: 'Mermoz', href: '/properties?city=Dakar&location=Mermoz' },
      ]);
    },
  );

  it.each([[{}], [{ city: 'Dakar', location: 'Mermoz' }], [{ city: 'Inventée' }], [{ type: 'villa' }]])(
    'AC3 — %o n’est pas une page de ville : aucun bloc',
    async (requete) => {
      await rendre(requete);
      expect(liensVus ?? null).toBeNull();
    },
  );
});
