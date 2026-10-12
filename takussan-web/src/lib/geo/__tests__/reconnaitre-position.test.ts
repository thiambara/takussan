import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { coordonneesDepuisLienGoogle, horsDuSenegal, reconnaitrePosition } from '@/lib/geo/reconnaitre-position';

/**
 * TCK-633 (AC9) — « Collez un lien ou une position ». Les liens se jugent sur la fixture que
 * l'API lit aussi (`GoogleMapsCoordinatesTest`) : un format lu d'un seul côté rougit l'autre.
 */
interface Lien {
  readonly cas: string;
  readonly url: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const { liens } = JSON.parse(
  readFileSync(join(ROOT, 'takussan-api', 'tests', 'fixtures', 'liens-google-maps.json'), 'utf8'),
) as { liens: readonly Lien[] };

const DAKAR = { latitude: 14.6928, longitude: -17.4467 };

function coordonnees(saisie: string, reference: typeof DAKAR | null = DAKAR) {
  const r = reconnaitrePosition(saisie, reference);
  if (r.kind !== 'coordonnees') throw new Error(`${saisie} → ${r.kind}`);
  return r;
}

describe('coordonneesDepuisLienGoogle — concordance avec GoogleMapsCoordinates (API)', () => {
  it('la fixture partagée porte des cas', () => {
    expect(liens.length).toBeGreaterThanOrEqual(10);
  });

  it.each(liens.map((l) => [l.cas, l] as const))('%s', (_, l) => {
    const lu = coordonneesDepuisLienGoogle(l.url);
    if (l.latitude === null) {
      expect(lu).toBeNull();
      return;
    }
    expect(lu?.latitude).toBe(l.latitude);
    expect(lu?.longitude).toBe(l.longitude);
  });
});

describe('reconnaitrePosition', () => {
  it.each([
    ['7C64PG8J+MW', 'plus-code', 14.7166875, -17.4676875],
    ['PG8J+MW', 'plus-code-court', 14.7166875, -17.4676875],
    ['PG8J+MW Dakar, Sénégal', 'plus-code-court', 14.7166875, -17.4676875],
    ['8J+MW', 'plus-code-court', 14.7166875, -17.4676875],
    ['14.7166875, -17.4676875', 'decimal', 14.7166875, -17.4676875],
    ['14,7166875; -17,4676875', 'decimal', 14.7166875, -17.4676875],
    ['geo:14.7166,-17.4677?z=17', 'geo', 14.7166, -17.4677],
    [`14°43'00.1"N 17°28'03.6"W`, 'dms', 14.7166944, -17.4676667],
    [`N 14° 43' 0.1" W 17° 28' 3.6"`, 'dms', 14.7166944, -17.4676667],
    ['14°43′00,1″N 17°28′03,6″W', 'dms', 14.7166944, -17.4676667],
    [`14° 43.002' N, 17° 28.06' W`, 'dms', 14.7167, -17.4676667],
    ['Ma position : https://maps.google.com/maps?q=14.72046%2C-17.46744&z=17&hl=fr', 'lien', 14.72046, -17.46744],
    // Plans d'Apple (iPhone, en français) : degrés décimaux, virgule décimale, O pour l'ouest.
    ['14,7167° N, 17,4677° O', 'dms', 14.7167, -17.4677],
    ['14.7167° N, 17.4677° W', 'dms', 14.7167, -17.4677],
    ['14,7167°N 17,4677°W', 'dms', 14.7167, -17.4677],
    ['https://maps.apple.com/?ll=14.7167,-17.4677&q=Point%20E', 'lien', 14.7167, -17.4677],
    ['https://maps.apple.com/place?coordinate=14.7167,-17.4677&name=Point%20E', 'lien', 14.7167, -17.4677],
    // OpenStreetMap : le MARQUEUR (`mlat`/`mlon`) prime sur le centre de la vue (`#map=`).
    ['https://www.openstreetmap.org/?mlat=14.7167&mlon=-17.4677#map=12/14.7/-17.4', 'lien', 14.7167, -17.4677],
    ['https://www.openstreetmap.org/#map=17/14.71670/-17.46770', 'lien', 14.7167, -17.4677],
    ['https://openstreetmap.org/?mlat=14.7167&mlon=-17.4677', 'lien', 14.7167, -17.4677],
  ])('%s', (saisie, source, latitude, longitude) => {
    const r = coordonnees(saisie);
    expect(r.source).toBe(source);
    expect(r.latitude).toBeCloseTo(latitude, 6);
    expect(r.longitude).toBeCloseTo(longitude, 6);
  });

  it('un code court se rapporte à la VILLE choisie, pas à Dakar', () => {
    const r = coordonnees('HPMH+86', { latitude: 12.5833125, longitude: -16.2719375 });
    expect(r.latitude).toBeCloseTo(12.5833125, 6);
    expect(r.longitude).toBeCloseTo(-16.2719375, 6);
  });

  it('un code court SANS ville choisie ne se devine pas', () => {
    expect(reconnaitrePosition('PG8J+MW', null)).toEqual({ kind: 'plus-code-court-sans-reference', code: 'PG8J+MW' });
  });

  it('un lien court se résout par le serveur', () => {
    expect(reconnaitrePosition('https://maps.app.goo.gl/x7Jk2mN9pQ', DAKAR)).toEqual({
      kind: 'lien-a-resoudre',
      url: 'https://maps.app.goo.gl/x7Jk2mN9pQ',
    });
  });

  it.each([
    'https://www.openstreetmap.org/node/123456',
    'https://evil.example/?mlat=14.7&mlon=-17.4#map=17/14.7/-17.4',
    'https://maps.apple.com/?q=Dakar',
    'bonjour',
    '91.0, 10.0',
    '',
  ])('« %s » n’est pas une position', (saisie) => {
    expect(reconnaitrePosition(saisie, DAKAR)).toEqual({ kind: 'inconnu' });
  });

  it('hors du Sénégal est SIGNALÉ, pas refusé', () => {
    expect(horsDuSenegal({ latitude: 48.8566, longitude: 2.3522 })).toBe(true);
    expect(horsDuSenegal({ latitude: 14.7, longitude: -17.4 })).toBe(false);
  });
});
