import { describe, expect, it } from 'vitest';

import { decoderPlusCode, recupererPlusCodeCourt } from '@/lib/geo/plus-code';

/**
 * TCK-633 (AC9) — les Plus Codes, décodés sans le paquet `open-location-code` (E-7). Les vecteurs
 * ont été vérifiés contre l'implémentation de référence de Google le 2026-10-12.
 */
const DAKAR = { latitude: 14.6928, longitude: -17.4467 };

describe('decoderPlusCode', () => {
  it.each([
    ['7C64PG8J+MW', 14.7166875, -17.4676875],
    ['7C64MHV3+48', 14.6928125, -17.4466875],
    ['7c64pg8j+mw', 14.7166875, -17.4676875],
  ])('%s', (code, latitude, longitude) => {
    const point = decoderPlusCode(code);
    expect(point?.latitude).toBeCloseTo(latitude, 6);
    expect(point?.longitude).toBeCloseTo(longitude, 6);
  });

  it('refuse un code court, un code hors alphabet et une première paire impossible', () => {
    expect(decoderPlusCode('PG8J+MW')).toBeNull();
    expect(decoderPlusCode('7C64PG8J+MA')).toBeNull();
    expect(decoderPlusCode('XC64PG8J+MW')).toBeNull();
  });
});

describe('recupererPlusCodeCourt', () => {
  it('rapporte un code court à la cellule de la référence', () => {
    const point = recupererPlusCodeCourt('PG8J+MW', DAKAR);
    expect(point?.latitude).toBeCloseTo(14.7166875, 6);
    expect(point?.longitude).toBeCloseTo(-17.4676875, 6);
  });

  it('un code de quatre caractères avant le « + » aussi', () => {
    const point = recupererPlusCodeCourt('8J+MW', { latitude: 14.7, longitude: -17.45 });
    expect(point?.latitude).toBeCloseTo(14.7166875, 6);
    expect(point?.longitude).toBeCloseTo(-17.4676875, 6);
  });

  it('la référence DÉCIDE : HPMH+86 est à Ziguinchor rapporté à Ziguinchor, en mer rapporté à Dakar', () => {
    const ziguinchor = recupererPlusCodeCourt('HPMH+86', { latitude: 12.56, longitude: -16.27 });
    expect(ziguinchor?.latitude).toBeCloseTo(12.5833125, 6);
    expect(ziguinchor?.longitude).toBeCloseTo(-16.2719375, 6);
    expect(recupererPlusCodeCourt('HPMH+86', DAKAR)?.latitude).toBeCloseTo(14.5833125, 6);
  });
});
