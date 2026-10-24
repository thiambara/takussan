/**
 * P220.08 (TCK-2142) — `collaboratorName` passe par `nomAffichable()` et garde ses replis : le
 * pseudonyme avant `#<id>`, puis `#<user_id>` sans compte chargé. Garde de non-régression : ces cas
 * étaient déjà justes avant le passage par l'assembleur.
 */
import { describe, expect, it } from 'vitest';

import { collaboratorName, type PropertyCollaboratorRow } from '../property-collaborators';

function ligne(user: PropertyCollaboratorRow['user']): PropertyCollaboratorRow {
  return { id: 1, user_id: 5, role: 'agent', is_primary: false, commission_share: null, user };
}

describe('collaboratorName (P220.08)', () => {
  it('prénom et nom, sinon pseudonyme, sinon #<id>', () => {
    expect(collaboratorName(ligne({ id: 5, first_name: 'Awa', last_name: 'Diop', username: 'awa' }))).toBe('Awa Diop');
    expect(collaboratorName(ligne({ id: 5, first_name: '', last_name: '', username: 'awa' }))).toBe('awa');
    expect(collaboratorName(ligne({ id: 5, first_name: '', last_name: null, username: null }))).toBe('#5');
    expect(collaboratorName(ligne(null))).toBe('#5');
  });
});
