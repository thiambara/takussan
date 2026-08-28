import { describe, expect, it, vi } from 'vitest';

import { ORIGINE_SITE, alternatesPubliques } from '../alternates';

/**
 * TCK-433 · AC4 — **`metadataBase` est posé, et une image OG RELATIVE en sort absolue.**
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE TEST IMPORTE LE RÉSOLVEUR DE NEXT
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * L'AC exige que l'épreuve porte sur une valeur **relative**, « pas sur la valeur absolue que
 * l'API rend aujourd'hui ». Assérer `metadata.metadataBase === new URL(ORIGINE_SITE)` ne
 * cocherait que la moitié : ça dit que la clé est là, pas ce qu'elle FAIT.
 *
 * `resolveUrl` est la fonction que Next applique lui-même à `openGraph.images` et
 * `twitter.images` (`next/dist/lib/metadata/resolvers/resolve-url`). L'importer fait porter le
 * test sur la RÈGLE du framework plutôt que sur une réimplémentation de `new URL(a, b)` — laquelle
 * serait verte quel que soit le comportement réel de Next.
 *
 * ⚠ C'est un module INTERNE, non exporté par la surface publique du paquet : si une montée de
 * version le déplace, ce test rougit à l'import. C'est le bon signal — il dit « la règle qu'on
 * croyait éprouver a bougé », et non « tout va bien ».
 */
const { resolveUrl } = await import('next/dist/lib/metadata/resolvers/resolve-url.js');

/**
 * ⚠ `next/font/google` est un module que le COMPILATEUR de Next remplace à la construction : il
 * télécharge les fontes et fabrique les classes CSS. Sous vitest il est importé tel quel, et
 * `Geist(...)` lève « Geist is not a function ». Le doubler n'affaiblit rien de ce qui est éprouvé
 * ici — la fonction sous test ne lit aucune fonte —, mais il faut nommer chaque export : un
 * `Proxy` sans `ownKeys` ne présente aucun export nommé au résolveur de modules.
 */
const fonteDeTest = () => ({ variable: '--fonte-de-test', className: 'fonte-de-test' });
vi.mock('next/font/google', () => ({
  Geist: fonteDeTest,
  Manrope: fonteDeTest,
  Inter: fonteDeTest,
  Bricolage_Grotesque: fonteDeTest,
  DM_Sans: fonteDeTest,
  Fraunces: fonteDeTest,
}));

describe('metadataBase', () => {
  /**
   * ⚠ **Plafond de temps explicite, et c'est une MESURE, pas un confort.**
   *
   * Importer `@/app/layout` tire tout son graphe : six fontes, `@/lib/auth`, sept fournisseurs
   * clients, `globals.css`. Mesuré le 2026-08-27 : ~5 s ce fichier seul, **> 20 s** quand la
   * commande porte sur 60 fichiers en parallèle — c'est-à-dire un rouge qui accuse le code alors
   * qu'il décrit la machine (`CLAUDE.md` § « Qui lance quoi », facteur ×11 à ×17 sous charge).
   *
   * Le plafond du dépôt (20 s, `vitest.config.ts`) est dimensionné pour des tests d'INTERACTION ;
   * celui-ci paie un coût de transformation, pas de rendu. 60 s laisse trois fois la mesure sous
   * charge. Le seul autre remède serait de doubler les sept fournisseurs, ce qui ferait porter le
   * test sur une liste d'imports à tenir à jour plutôt que sur la métadonnée.
   */
  it('la racine le pose sur l’origine du site', async () => {
    // Le layout racine est un composant serveur : on ne monte que sa `generateMetadata`, avec les
    // seules dépendances qu'elle a — `getTranslations`.
    vi.doMock('next-intl/server', () => ({
      getTranslations: async () => (cle: string) => cle,
      getLocale: async () => 'fr',
    }));
    const { generateMetadata } = await import('@/app/layout');
    const metadata = await generateMetadata();

    expect(metadata.metadataBase).toBeInstanceOf(URL);
    expect((metadata.metadataBase as URL).origin).toBe(ORIGINE_SITE);
    vi.doUnmock('next-intl/server');
  }, 60_000);

  it('une image OG RELATIVE devient absolue sur l’origine du site', () => {
    // Le cas réel visé : le jour où l'API rend un `logo_url` en `/storage/…` au lieu d'une URL
    // complète. Sans `metadataBase`, la carte sociale se casserait en silence.
    const resolue = resolveUrl('/storage/logos/immo-dakar.png', new URL(ORIGINE_SITE));
    expect(String(resolue)).toBe(`${ORIGINE_SITE}/storage/logos/immo-dakar.png`);
  });

  it('sans `metadataBase`, la MÊME image relative ne devient PAS absolue', () => {
    // L'ablation, écrite dans le test : c'est ce qui prouve que la clé porte l'effet.
    const sansBase = resolveUrl('/storage/logos/immo-dakar.png', null);
    expect(String(sansBase)).not.toBe(`${ORIGINE_SITE}/storage/logos/immo-dakar.png`);
  });

  it('une image DÉJÀ absolue traverse `metadataBase` sans être réécrite', () => {
    // Les trois pages de détail rendent aujourd'hui des URL absolues servies par l'API ; poser
    // `metadataBase` ne doit rien leur changer.
    const absolue = 'https://media.takussan.test/photos/1.jpg';
    expect(String(resolveUrl(absolue, new URL(ORIGINE_SITE)))).toBe(absolue);
  });
});

describe('alternatesPubliques — canonique ET hreflang, dérivés du même chemin', () => {
  it('la canonique porte le PRÉFIXE de langue de la page courante', () => {
    // Depuis TCK-434, `/properties/x` rend 307 : une canonique non préfixée désignerait une
    // redirection comme version de référence.
    expect(alternatesPubliques('/properties/x', 'en').canonical).toBe(
      `${ORIGINE_SITE}/en/properties/x`,
    );
    expect(alternatesPubliques('/properties/x', 'wo').canonical).toBe(
      `${ORIGINE_SITE}/wo/properties/x`,
    );
  });

  it('la canonique est ABSOLUE', () => {
    expect(String(alternatesPubliques('/', 'fr').canonical)).toMatch(/^https:\/\//);
  });

  it('la canonique de chaque langue est l’une des alternatives déclarées', () => {
    // Le signal contradictoire à éviter : une canonique qui désigne une URL que les `hreflang`
    // ne nomment pas. Google ignore alors le groupe entier.
    for (const locale of ['fr', 'en', 'wo'] as const) {
      const { canonical, languages } = alternatesPubliques('/agencies/immo-dakar', locale);
      expect(Object.values(languages!).map(String)).toContain(String(canonical));
      expect(String(languages![locale])).toBe(String(canonical));
    }
  });

  it('accepte un chemin PORTANT UNE REQUÊTE et préfixe malgré tout', () => {
    // `estCheminLocalisable` ne regarde l'extension que du dernier segment : un `?` n'en est pas
    // une. C'est ce qui permet à la liste de passer sa canonique filtrée telle quelle.
    const { canonical, languages } = alternatesPubliques('/properties?type=villa', 'fr');
    expect(canonical).toBe(`${ORIGINE_SITE}/fr/properties?type=villa`);
    expect(languages!.en).toBe(`${ORIGINE_SITE}/en/properties?type=villa`);
  });

  it('refuse une surface non localisée, comme `alternatesLangues`', () => {
    expect(() => alternatesPubliques('/app/overview', 'fr')).toThrow();
  });
});
