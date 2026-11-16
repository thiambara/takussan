import { describe, expect, it } from 'vitest';

import type { Profile } from '@/types/profile';
import { personaDuProfil } from '../persona-du-profil';

/** TCK-2864 — la persona des préférences de notification : celle de la coque, par le profil actif. */
const profil = (id: string, kind: 'standard' | 'individual' = 'standard'): Profile =>
  ({ id, type: id.split(':')[0], numeric_id: 1, agency_id: 1, status: 'active', created_at: null, agency: { id: 1, name: 'A', slug: 'a', kind } }) as Profile;

describe('personaDuProfil (TCK-2864)', () => {
  it('le profil actif décide, pas l’union des rôles', () => {
    const roles = ['agent', 'owner'] as never;
    expect(personaDuProfil({ user: { roles }, profils: [profil('agent:1'), profil('owner:2')], profilActif: 'owner:2' })).toBe('bailleur');
    expect(personaDuProfil({ user: { roles }, profils: [profil('agent:1'), profil('owner:2')], profilActif: 'agent:1' })).toBe('agent');
  });

  it('l’admin d’une agence `individual` est l’hôte', () => {
    const roles = ['agency_admin', 'owner'] as never;
    expect(
      personaDuProfil({ user: { roles }, profils: [profil('agency_admin:5', 'individual')], profilActif: 'agency_admin:5' }),
    ).toBe('hote');
  });

  it('sans profil actif lisible, celui que l’API a lié, sinon l’ordre de l’auto-bascule', () => {
    expect(personaDuProfil({ user: { roles: ['agent', 'owner'] as never, active_profile_id: 'agent:1' }, profils: null, profilActif: null })).toBe('agent');
    expect(personaDuProfil({ user: { roles: ['tenant', 'customer'] as never }, profils: null, profilActif: null })).toBe('locataire');
  });
});
