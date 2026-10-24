/**
 * P212 — le jour de l'API se calcule en UTC, quel que soit le fuseau du navigateur. Paris, pour
 * que les changements d'heure et l'écart avec UTC soient dans le champ du test.
 */
process.env.TZ = 'Europe/Paris';

import { describe, it, expect } from 'vitest';
import { decalerAnnees, decalerJour, jourDeLApi, jourEnDateLocale } from '../jour-de-l-api';

describe('jour-de-l-api', () => {
  it('jourDeLApi rend le jour UTC, pas le jour local', () => {
    // 00:30 à Paris le 25 octobre = 22:30 Z le 24.
    expect(jourDeLApi(new Date('2026-10-24T22:30:00Z'))).toBe('2026-10-24');
  });

  it('decalerJour traverse un changement d’heure sans perdre de jour', () => {
    expect(decalerJour('2026-03-29', 1)).toBe('2026-03-30');
    expect(decalerJour('2026-02-28', 30)).toBe('2026-03-30');
    expect(decalerJour('2026-10-25', 60)).toBe('2026-12-24');
  });

  it('decalerAnnees garde le jour, et le 29 février passe au 1er mars', () => {
    expect(decalerAnnees('2026-10-26', 1)).toBe('2027-10-26');
    expect(decalerAnnees('2028-02-29', 1)).toBe('2029-03-01');
  });

  it('jourEnDateLocale rend minuit local du jour', () => {
    const d = jourEnDateLocale('2026-03-29');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 2, 29, 0]);
  });
});
