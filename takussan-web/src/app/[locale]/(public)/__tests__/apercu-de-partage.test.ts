// @vitest-environment node
/**
 * TCK-759 (P09.03) — l'aperçu de partage par défaut du site public.
 *
 * Hors des fiches, aucune page publique n'émettait de `og:*` : un lien de l'accueil ou d'une liste
 * par ville, partagé sur WhatsApp, n'avait ni image ni nom de site. Deux choses le ferment :
 *
 * - le `generateMetadata` du layout public pose un `openGraph` par défaut, SANS titre ni
 *   description : Next les reprend de chaque page (`inheritFromMetadata` de
 *   `next/dist/lib/metadata/resolve-metadata.js`), alors qu'un titre posé ici serait celui de
 *   l'accueil sur toutes les pages ;
 * - `opengraph-image.tsx`, à la racine du groupe, rend l'image 1200 × 630 depuis le logo. Next la
 *   pose sur toute page qui ne déclare pas ses propres `openGraph.images`.
 *
 * Environnement `node` : `ImageResponse` rend le PNG par Satori et resvg, que jsdom ne sert pas.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', async () => ({
  ...(await import('@/test/intl')).mockTraductionsServeur(),
  setRequestLocale: () => undefined,
}));

const params = (locale: string) => ({ params: Promise.resolve({ locale }) });

describe('layout public — openGraph par défaut (TCK-759)', () => {
  it.each([
    ['fr', 'fr_SN'],
    ['en', 'en_US'],
    ['wo', 'wo_SN'],
  ])('en %s : site, type et langue servie, sans titre figé', async (locale, ogLocale) => {
    const { generateMetadata } = await import('../layout');
    const meta = await generateMetadata(params(locale));

    expect(meta.openGraph).toMatchObject({ type: 'website', siteName: 'Takussan', locale: ogLocale });
    expect(meta.openGraph).not.toHaveProperty('title');
    expect(meta.openGraph).not.toHaveProperty('description');
    expect(meta.openGraph).not.toHaveProperty('url');
    expect(meta.twitter).toMatchObject({ card: 'summary_large_image' });
  });
});

describe('opengraph-image du groupe public (TCK-759)', () => {
  it('déclare un PNG de 1200 × 630 avec un texte de remplacement', async () => {
    const mod = await import('../opengraph-image');
    expect(mod.size).toEqual({ width: 1200, height: 630 });
    expect(mod.contentType).toBe('image/png');
    expect(mod.alt).toBe('Takussan');
  });

  it('rend réellement un PNG aux dimensions annoncées', async () => {
    const { default: Image } = await import('../opengraph-image');
    const reponse = await Image();
    expect(reponse.headers.get('content-type')).toBe('image/png');

    const octets = new Uint8Array(await reponse.arrayBuffer());
    // Signature PNG, puis largeur et hauteur de l'en-tête IHDR (octets 16 à 23, gros-boutiste).
    expect(Array.from(octets.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const vue = new DataView(octets.buffer, octets.byteOffset);
    expect([vue.getUint32(16), vue.getUint32(20)]).toEqual([1200, 630]);
  });
});
