import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  COTE_MAX,
  QUALITE,
  dimensionsPlafonnees,
  outilsNavigateur,
  reduirePhoto,
  reduirePhotos,
  type OutilsImage,
} from '../reduire-photo';

/**
 * TCK-542. jsdom ne décode ni n'encode aucune image : les outils du navigateur sont remplacés par
 * des doublures qui rendent les dimensions voulues et un blob du type et du poids choisis. Ce qui
 * s'éprouve ici, c'est la DÉCISION (réduire ou rendre l'original) ; le décodage réel, l'orientation
 * et les poids se sont mesurés au navigateur (Notes d'implémentation du ticket).
 */

function photo(octets: number, type = 'image/jpeg', nom = 'photo.jpg'): File {
  return new File([new Uint8Array(octets)], nom, {
    type,
    lastModified: 1_700_000_000_000,
  });
}

function outils(
  largeur: number,
  hauteur: number,
  sortie: { readonly octets?: number; readonly type?: string | null } = {},
) {
  const close = vi.fn();
  const doublure = {
    decoder: vi.fn<OutilsImage['decoder']>(async () => ({
      width: largeur,
      height: hauteur,
      source: {} as CanvasImageSource,
      close,
    })),
    encoder: vi.fn<OutilsImage['encoder']>(async (_i, _l, _h, type) =>
      sortie.type === null
        ? null
        : new Blob([new Uint8Array(sortie.octets ?? 1000)], {
            type: sortie.type ?? type,
          }),
    ),
  } satisfies OutilsImage;
  return { ...doublure, close };
}

describe('dimensionsPlafonnees', () => {
  it('plafonne le grand côté à 2560 px, proportions gardées — paysage et portrait', () => {
    expect(dimensionsPlafonnees(4000, 3000)).toEqual({
      width: 2560,
      height: 1920,
    });
    expect(dimensionsPlafonnees(3000, 4000)).toEqual({
      width: 1920,
      height: 2560,
    });
  });

  it('rend null sous le plafond ET au plafond exact : rien à agrandir ni à réencoder', () => {
    expect(dimensionsPlafonnees(1200, 900)).toBeNull();
    expect(dimensionsPlafonnees(COTE_MAX, 1000)).toBeNull();
  });
});

describe('reduirePhoto', () => {
  it('AC1 — un JPEG 4000×3000 part en JPEG 2560×1920, qualité 0,9, même nom', async () => {
    const o = outils(4000, 3000, { octets: 900_000 });
    const original = photo(4_000_000);

    const reduite = await reduirePhoto(original, o);

    expect(o.encoder).toHaveBeenCalledWith(
      expect.anything(),
      2560,
      1920,
      'image/jpeg',
      QUALITE,
    );
    expect(reduite).not.toBe(original);
    expect(reduite.type).toBe('image/jpeg');
    expect(reduite.name).toBe('photo.jpg');
    expect(reduite.size).toBe(900_000);
    expect(o.close).toHaveBeenCalled();
  });

  it('le format ne change pas : un PNG est réencodé en PNG, un WebP en WebP', async () => {
    for (const type of ['image/png', 'image/webp']) {
      const o = outils(5000, 2000, { octets: 10 });
      const reduite = await reduirePhoto(photo(100, type), o);
      expect(o.encoder.mock.calls[0][3]).toBe(type);
      expect(reduite.type).toBe(type);
    }
  });

  it('AC2 — une photo de 1200×900 part octet pour octet, sans passer par l’encodeur', async () => {
    const o = outils(1200, 900);
    const original = photo(300_000);

    expect(await reduirePhoto(original, o)).toBe(original);
    expect(o.encoder).not.toHaveBeenCalled();
  });

  it('AC4 — un fichier que le navigateur ne décode pas part tel quel', async () => {
    const o = outils(0, 0);
    o.decoder.mockRejectedValueOnce(
      new DOMException('The source image could not be decoded.'),
    );
    const original = photo(2_000_000);

    expect(await reduirePhoto(original, o)).toBe(original);
  });

  it('un type que l’API refuse (HEIC) n’est même pas décodé : la validation serveur tranche', async () => {
    const o = outils(4000, 3000);
    const heic = photo(2_000_000, 'image/heic', 'IMG_0001.HEIC');

    expect(await reduirePhoto(heic, o)).toBe(heic);
    expect(o.decoder).not.toHaveBeenCalled();
  });

  it('un résultat plus lourd que l’original → l’original part', async () => {
    const original = photo(500_000);
    expect(
      await reduirePhoto(original, outils(4000, 3000, { octets: 600_000 })),
    ).toBe(original);
  });

  it('un encodeur qui rend un AUTRE type (Safari sans WebP rend du PNG) → l’original part', async () => {
    const original = photo(500_000, 'image/webp', 'a.webp');
    expect(
      await reduirePhoto(
        original,
        outils(4000, 3000, { octets: 10, type: 'image/png' }),
      ),
    ).toBe(original);
  });

  it('un encodeur qui ne rend rien, ou qui lève (mémoire), → l’original part', async () => {
    const original = photo(500_000);
    expect(
      await reduirePhoto(original, outils(4000, 3000, { type: null })),
    ).toBe(original);

    const o = outils(4000, 3000);
    o.encoder.mockRejectedValueOnce(new RangeError('allocation'));
    expect(await reduirePhoto(original, o)).toBe(original);
    expect(o.close).toHaveBeenCalled();
  });
});

describe('reduirePhotos', () => {
  it('traite le lot dans l’ordre, une photo à la fois', async () => {
    let enCours = 0;
    let pic = 0;
    const o = outils(4000, 3000, { octets: 10 });
    o.decoder.mockImplementation(async () => {
      enCours += 1;
      pic = Math.max(pic, enCours);
      await new Promise((r) => setTimeout(r, 1));
      return {
        width: 4000,
        height: 3000,
        source: {} as CanvasImageSource,
        close: () => {
          enCours -= 1;
        },
      };
    });

    const lot = [
      photo(100, 'image/jpeg', 'a.jpg'),
      photo(100, 'image/jpeg', 'b.jpg'),
    ];
    const reduites = await reduirePhotos(lot, o);

    expect(reduites.map((f) => f.name)).toEqual(['a.jpg', 'b.jpg']);
    expect(pic).toBe(1);
  });
});

describe('outilsNavigateur.decoder', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('AC3 — demande au navigateur d’appliquer l’orientation EXIF aux pixels', async () => {
    const bitmap = { width: 3000, height: 4000, close: vi.fn() };
    const createImageBitmap = vi.fn(async () => bitmap);
    vi.stubGlobal('createImageBitmap', createImageBitmap);

    const image = await outilsNavigateur.decoder(photo(10));

    expect(createImageBitmap).toHaveBeenCalledWith(expect.any(Blob), {
      imageOrientation: 'from-image',
    });
    expect(image).toMatchObject({ width: 3000, height: 4000 });
  });

  it('sans createImageBitmap (jsdom, vieux navigateur), la réduction rend l’original', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    const original = photo(10);
    expect(await reduirePhoto(original)).toBe(original);
  });
});
