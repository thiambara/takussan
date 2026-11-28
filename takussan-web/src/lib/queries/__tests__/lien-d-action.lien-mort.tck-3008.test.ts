import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api';
import { lienMortDe } from '@/lib/queries/lien-d-action';

/**
 * TCK-3008 — un lien mort se lit par le CODE du refus (`action_link.*`), jamais par sa prose : un `message` qui
 * ressemble à un code n'en est pas un, et un 410 sans code reste « expiré ».
 */
describe('lienMortDe — le code, pas la prose (TCK-3008)', () => {
  it('un 410 se lit par son code', () => {
    expect(lienMortDe(new ApiError(410, { code: 'action_link.used', message: 'Ce lien a déjà servi.' }))).toBe('used');
    expect(lienMortDe(new ApiError(410, { code: 'action_link.revoked' }))).toBe('revoked');
  });

  it('un 410 dont seul le message ressemble à un code reste « expiré »', () => {
    expect(lienMortDe(new ApiError(410, { message: 'action_link.used' }))).toBe('expired');
    expect(lienMortDe(new ApiError(410, { error: 'action_link.revoked' }))).toBe('expired');
  });

  it('un 400 `invalid_path` (jeton refusé par cheminApi) ne désigne aucun lien ; un 400 autre n’est pas un lien mort', () => {
    expect(lienMortDe(new ApiError(400, { code: 'invalid_path' }))).toBe('notFound');
    expect(lienMortDe(new ApiError(400, { message: 'invalid_path' }))).toBeNull();
  });
});
