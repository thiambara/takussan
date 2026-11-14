/** TCK-2814 — le point unique où le statut d'une lecture décide de la reprise. */
import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api';
import { erreurAMontrer, natureDeLErreur } from '../nature-de-l-erreur';

describe('natureDeLErreur (TCK-2814)', () => {
  it.each([
    [new ApiError(403, null), 'refus'],
    [new ApiError(404, null), 'introuvable'],
    [new ApiError(500, null), 'panne'],
    [new ApiError(503, null), 'panne'],
    [new ApiError(429, null), 'panne'],
    [new TypeError('Failed to fetch'), 'panne'],
    [new Error('Server Error'), 'panne'],
    [null, 'panne'],
  ])('%s → %s', (erreur, nature) => {
    expect(natureDeLErreur(erreur)).toBe(nature);
  });
});

describe('erreurAMontrer (TCK-2814)', () => {
  const refus = new ApiError(403, null);
  const panne = new ApiError(500, null);

  it('une panne l’emporte : la reprise relit tout', () => {
    expect(erreurAMontrer(refus, panne)).toBe(panne);
  });

  it('sans panne, la première erreur', () => {
    const absent = new ApiError(404, null);
    expect(erreurAMontrer(null, refus, absent)).toBe(refus);
  });

  it('aucune erreur → null', () => {
    expect(erreurAMontrer(null, undefined)).toBeNull();
  });
});
