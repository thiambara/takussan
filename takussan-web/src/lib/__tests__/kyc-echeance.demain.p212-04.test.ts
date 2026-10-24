/**
 * P212.04 — `demainIso`, `min` du champ d'échéance d'une pièce KYC, rend le lendemain du jour de
 * l'API : `UploadKycDocumentRequest` exige `after:today`, jugé en UTC. Navigateur à New York,
 * fixé AVANT toute date.
 */
process.env.TZ = 'America/New_York';

import { describe, expect, it } from 'vitest';
import { demainIso } from '../kyc-echeance';

describe('demainIso — lendemain du jour de l’API (P212.04)', () => {
  it('à 01:00 Z le 25 (21:00 le 24 à New York), rend le 26, premier jour que l’API accepte', () => {
    expect(demainIso(new Date('2026-10-25T01:00:00Z'))).toBe('2026-10-26');
  });

  it('à 18:00 Z le 31 décembre, passe à l’année suivante', () => {
    expect(demainIso(new Date('2026-12-31T18:00:00Z'))).toBe('2027-01-01');
  });
});
