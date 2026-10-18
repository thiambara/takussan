import { beforeEach, describe, expect, it, vi } from 'vitest';

import { origineSite } from '@/lib/alternates';

/**
 * TCK-916 (P35.02) — les liens « Quartiers de <ville> » d'une page de ville.
 *
 * Décision du porteur : chaque lien vise « une canonique présente au sitemap ». Le test le vérifie
 * par le contenu : la route du sitemap est jouée avec LES MÊMES doublures de facettes, et chaque
 * lien rendu doit y figurer.
 */
const facettes = vi.hoisted(() => ({ villesAvecComptes: vi.fn(), quartiersDeLaVille: vi.fn() }));

vi.mock('@/lib/queries/facettes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/facettes')>()),
  villesAvecComptes: facettes.villesAvecComptes,
  quartiersDeLaVille: facettes.quartiersDeLaVille,
}));
vi.mock('@/lib/queries/sitemap-catalogue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/sitemap-catalogue')>()),
  listerBiensDuSitemap: async () => [],
}));
vi.mock('@/lib/queries/public-profiles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/public-profiles')>()),
  listerSlugsDeProfils: async () => [],
}));

const { liensDesQuartiers } = await import('@/lib/liens-de-lieu');

const VILLES = new Map([['dakar', 'Dakar']]);

beforeEach(() => {
  facettes.villesAvecComptes.mockReset();
  facettes.villesAvecComptes.mockResolvedValue([
    { value: 'Dakar', count: 12, contracts: { sale: 6, rent: 6 } },
  ]);
  facettes.quartiersDeLaVille.mockReset();
  facettes.quartiersDeLaVille.mockResolvedValue(
    new Map([
      ['ngor', 'Ngor'],
      ['mermoz', 'Mermoz'],
    ]),
  );
});

describe('liensDesQuartiers', () => {
  it('AC1 — un lien par quartier indexable, vers la canonique ville × quartier, triés par nom', async () => {
    const liens = await liensDesQuartiers('Dakar', VILLES);

    expect(liens).toEqual([
      { libelle: 'Mermoz', href: '/properties?city=Dakar&location=Mermoz' },
      { libelle: 'Ngor', href: '/properties?city=Dakar&location=Ngor' },
    ]);
    expect(facettes.quartiersDeLaVille).toHaveBeenCalledWith('Dakar');
  });

  it('AC1 — chaque lien est une page présente au sitemap', async () => {
    const liens = await liensDesQuartiers('Dakar', VILLES);
    // Les URL du sitemap sont déjà échappées pour le XML (`&amp;`) : on compare l'URL elle-même.
    const urls = new Set(
      (await (await import('@/app/sitemap')).default()).map((e) => e.url.replaceAll('&amp;', '&')),
    );

    expect(liens.length).toBeGreaterThan(0);
    for (const { href } of liens) expect(urls).toContain(`${origineSite()}/fr${href}`);
  });

  it.each([[null], [new Map<string, string>()]])('AC2 — domaine des quartiers %o : aucun lien', async (domaine) => {
    facettes.quartiersDeLaVille.mockResolvedValue(domaine);
    expect(await liensDesQuartiers('Dakar', VILLES)).toEqual([]);
  });
});
