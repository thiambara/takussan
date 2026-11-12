/**
 * TCK-2632 — la pièce jointe avant l'envoi : le refus se dit AVANT (un PDF de 11 Mo ne part pas),
 * une photo de 48 Mpx est réduite sous la borne de 20 Mpx de l'API (`PixelsAuPlus`), et le poids
 * d'une image ne se juge qu'après réduction.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  PIXELS_APRES_REDUCTION,
  PLAFOND_PIXELS,
  dimensionsReduites,
  natureDeLaPiece,
  preparerImage,
  refusApresReduction,
  refusAvantReduction,
  tailleLisible,
  type OutilsDImage,
} from '../piece-jointe';

const MO = 1024 * 1024;
const fichier = (nom: string, type: string, octets: number) => {
  const f = new File(['x'], nom, { type });
  Object.defineProperty(f, 'size', { value: octets });
  return f;
};
function outils(largeur: number, hauteur: number, octetsEncodes = 3 * MO) {
  const encoder = vi.fn(async (_s: CanvasImageSource, _l: number, _h: number, _q: number) => {
    const b = new Blob(['jpeg'], { type: 'image/jpeg' });
    Object.defineProperty(b, 'size', { value: octetsEncodes });
    return b;
  });
  const fermer = vi.fn();
  const o: OutilsDImage = { decoder: async () => ({ width: largeur, height: hauteur, source: {} as CanvasImageSource, fermer }), encoder };
  return { o, encoder, fermer };
}

describe('refus avant l’envoi (TCK-2632)', () => {
  it('un PDF de 11 Mo est refusé, un PDF de 9 Mo passe', () => {
    expect(refusAvantReduction(fichier('bail.pdf', 'application/pdf', 11 * MO))).toBe('pdf-trop-lourd');
    expect(refusAvantReduction(fichier('bail.pdf', 'application/pdf', 9 * MO))).toBeNull();
  });

  it('un type que l’API ne reçoit pas est refusé (HEIC, Word, GIF)', () => {
    for (const type of ['image/heic', 'application/msword', 'image/gif', '']) {
      expect(refusAvantReduction(fichier('x', type, MO))).toBe('type');
    }
  });

  it('une image n’est PAS jugée sur son poids avant réduction', () => {
    expect(refusAvantReduction(fichier('photo.jpg', 'image/jpeg', 30 * MO))).toBeNull();
    expect(refusApresReduction(fichier('photo.jpg', 'image/jpeg', 9 * MO))).toBe('image-trop-lourde');
    expect(refusApresReduction(fichier('photo.jpg', 'image/jpeg', 8 * MO))).toBeNull();
    expect(natureDeLaPiece({ type: 'image/webp' })).toBe('image');
  });
});

describe('preparerImage — la borne des 20 Mpx (TCK-2632)', () => {
  it('une photo de 48 Mpx est réduite sous la borne, proportions gardées, en JPEG', async () => {
    const { o, encoder, fermer } = outils(8000, 6000);
    const sortie = await preparerImage(fichier('IMG_0042.HEIF.png', 'image/png', 6 * MO), o);
    const [, l, h] = encoder.mock.calls[0]!;
    expect(l * h).toBeLessThanOrEqual(PIXELS_APRES_REDUCTION);
    expect(l * h).toBeLessThanOrEqual(PLAFOND_PIXELS);
    expect(Math.abs(l / h - 8000 / 6000)).toBeLessThan(0.01);
    expect(sortie.type).toBe('image/jpeg');
    expect(sortie.name).toBe('IMG_0042.HEIF.jpg');
    expect(fermer).toHaveBeenCalled();
  });

  it('une photo de 12 Mpx et 3 Mo part telle quelle', async () => {
    const { o, encoder } = outils(4000, 3000);
    const brut = fichier('photo.jpg', 'image/jpeg', 3 * MO);
    expect(await preparerImage(brut, o)).toBe(brut);
    expect(encoder).not.toHaveBeenCalled();
  });

  it('une photo sous 20 Mpx mais de 12 Mo est réencodée (le poids, pas les pixels)', async () => {
    const { o, encoder } = outils(5000, 3500);
    await preparerImage(fichier('photo.png', 'image/png', 12 * MO), o);
    expect(encoder).toHaveBeenCalledTimes(1);
  });

  it('une image illisible part telle quelle : l’API tranchera', async () => {
    const brut = fichier('photo.jpg', 'image/jpeg', 2 * MO);
    const o: OutilsDImage = { decoder: () => Promise.reject(new Error('décodage')), encoder: vi.fn() };
    expect(await preparerImage(brut, o)).toBe(brut);
  });

  it('dimensionsReduites ne grandit jamais une image', () => {
    expect(dimensionsReduites(1200, 900)).toEqual({ largeur: 1200, hauteur: 900 });
  });
});

describe('tailleLisible (TCK-2632)', () => {
  it('l’unité vient d’Intl, dans la langue du lecteur', () => {
    // Intl sépare d'une espace fine insécable (U+202F) en français.
    expect(tailleLisible(2.4 * MO, 'fr')).toMatch(/^2,4\sMo$/);
    expect(tailleLisible(2.4 * MO, 'en')).toBe('2.4 MB');
    expect(tailleLisible(830 * 1024, 'fr')).toMatch(/^830\s?ko$/i);
    expect(tailleLisible(null, 'fr')).toBe('');
  });
});
