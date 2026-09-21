import { describe, expect, it } from 'vitest';

import { LARGEURS_MEDIA, QUALITE_MEDIA, arrondirLargeur, construireUrlImage } from '../image-loader';

/**
 * TCK-540 — le loader de Cloudflare Transformations (ADR-0029 §4).
 *
 * Éprouvé sur `construireUrlImage` et non sur l'export par défaut : `NEXT_PUBLIC_MEDIA_URL` est
 * inlinée au build, et muter `process.env` dans vitest n'éprouverait pas ce que le bundle livre.
 */
const MEDIA = 'https://media-preview.takussan.com';
const PHOTO = `${MEDIA}/42/conversions/photo-preview.jpg?v=1758441600`;

describe('construireUrlImage — seau public', () => {
  it('réécrit en Transformations, format=auto et onerror=redirect compris', () => {
    expect(construireUrlImage({ src: PHOTO, width: 640 }, MEDIA)).toBe(
      `${MEDIA}/cdn-cgi/image/width=640,quality=75,format=auto,onerror=redirect/42/conversions/photo-preview.jpg?v=1758441600`,
    );
  });

  it('conserve la requête de la source — `?v=` est ce qui invalide le cache de Cloudflare', () => {
    const url = construireUrlImage({ src: `${MEDIA}/7/a.jpg?v=2`, width: 384 }, MEDIA);
    expect(url.endsWith('/7/a.jpg?v=2')).toBe(true);
    expect(construireUrlImage({ src: `${MEDIA}/7/a.jpg?v=3`, width: 384 }, MEDIA)).not.toBe(url);
  });

  it('passe onerror=redirect : au-delà du quota (9422), Cloudflare rend la source au lieu d’une erreur', () => {
    expect(construireUrlImage({ src: PHOTO, width: 640 }, MEDIA)).toContain(',onerror=redirect/');
  });

  it('arrondit la largeur VERS LE HAUT au palier suivant', () => {
    expect(construireUrlImage({ src: PHOTO, width: 750 }, MEDIA)).toContain('/cdn-cgi/image/width=960,');
    expect(construireUrlImage({ src: PHOTO, width: 96 }, MEDIA)).toContain('/cdn-cgi/image/width=128,');
    expect(construireUrlImage({ src: PHOTO, width: 3840 }, MEDIA)).toContain('/cdn-cgi/image/width=1920,');
  });

  it('ignore la qualité demandée par un composant : une seule qualité, une seule facture', () => {
    expect(construireUrlImage({ src: PHOTO, width: 640, quality: 90 }, MEDIA)).toContain(`quality=${QUALITE_MEDIA},`);
  });

  it('les 14 largeurs du srcset de Next ne produisent que les paliers du jeu', () => {
    // deviceSizes de next.config.ts + imageSizes par défaut de Next 16.
    const srcset = [16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920];
    const largeurs = new Set(
      srcset.map((w) => construireUrlImage({ src: PHOTO, width: w }, MEDIA).match(/width=(\d+),/)?.[1]),
    );
    expect([...largeurs].map(Number)).toEqual([...LARGEURS_MEDIA]);
  });

  it('ne retransforme pas une URL déjà passée par /cdn-cgi/', () => {
    const deja = `${MEDIA}/cdn-cgi/image/width=640,quality=75,format=auto,onerror=redirect/42/a.jpg`;
    expect(construireUrlImage({ src: deja, width: 1280 }, MEDIA)).toBe(`${deja}#w=1280`);
  });
});

describe('construireUrlImage — tout le reste passe sans casser', () => {
  it('NEXT_PUBLIC_MEDIA_URL vide : l’URL de l’API ressort intacte (hors fragment)', () => {
    const api = 'http://127.0.0.1:8002/storage/42/conversions/photo-preview.jpg?v=1';
    const rendue = construireUrlImage({ src: api, width: 640 }, '');
    expect(rendue).toBe(`${api}#w=640`);
    expect(new URL(rendue).href.split('#')[0]).toBe(api);
  });

  it('un autre hôte que le seau n’est jamais envoyé à Transformations', () => {
    const url = construireUrlImage({ src: 'https://preview.api.takussan.com/storage/1/a.jpg', width: 640 }, MEDIA);
    expect(url).not.toContain('/cdn-cgi/');
    expect(url).toBe('https://preview.api.takussan.com/storage/1/a.jpg#w=640');
  });

  it('Unsplash reçoit ses paramètres natifs, les autres conservés', () => {
    const url = new URL(
      construireUrlImage(
        { src: 'https://images.unsplash.com/photo-1613490493576?w=1600&auto=format&fit=crop', width: 828 },
        MEDIA,
      ),
    );
    expect(url.searchParams.get('w')).toBe('828');
    expect(url.searchParams.get('q')).toBe('75');
    expect(url.searchParams.get('auto')).toBe('format');
    expect(url.searchParams.get('fit')).toBe('crop');
  });

  it('picsum ressort intacte, largeur en fragment', () => {
    expect(construireUrlImage({ src: 'https://picsum.photos/seed/a/800/600', width: 384 }, MEDIA)).toBe(
      'https://picsum.photos/seed/a/800/600#w=384',
    );
  });

  it.each([
    ['blob:', 'blob:https://www.takussan.com/0b6c7d1e-9f1a-4c7e-8d2b-1a2b3c4d5e6f'],
    ['data:', 'data:image/png;base64,iVBORw0KGgo='],
    ['relative', '/images/logo.png'],
  ])('%s ressort strictement inchangée', (_, src) => {
    expect(construireUrlImage({ src, width: 640 }, MEDIA)).toBe(src);
  });
});

describe('arrondirLargeur', () => {
  it('un palier exact reste lui-même', () => {
    for (const palier of LARGEURS_MEDIA) expect(arrondirLargeur(palier)).toBe(palier);
  });

  it('au-delà du plus grand palier, plafonne', () => {
    expect(arrondirLargeur(2048)).toBe(1920);
  });
});
