import { describe, expect, it } from 'vitest';

import type { Profile } from '@/types/profile';
import { identiteDuSommaire } from '../identite-du-sommaire';

/** TCK-2635 — « Agent · Dakar Immo » sous le nom, et « Voir ma fiche publique » quand elle existe. */
const TYPES = { agent: 'Agent', owner: 'Propriétaire', service_provider: 'Prestataire', agency_admin: 'Administrateur' } as const;
const libelle = (type: keyof typeof TYPES) => TYPES[type];
const profil = (autre: Partial<Profile>): Profile => ({
  id: 'x:1', type: 'agent', numeric_id: 1, agency_id: 1, status: 'active', created_at: null, ...autre,
});
const DAKAR_IMMO = { id: 1, name: 'Dakar Immo', slug: 'dakar-immo', kind: 'standard' as const };

describe('identiteDuSommaire (TCK-2635)', () => {
  it('le métier avant l’administration, avec son agence ; la fiche de l’agent par son slug', () => {
    const profils = [
      profil({ id: 'agency_admin:2', type: 'agency_admin', agency: DAKAR_IMMO }),
      profil({ id: 'agent:1', type: 'agent', agency: DAKAR_IMMO, public_slug: 'sokhna sene' }),
    ];
    expect(identiteDuSommaire({ profils }, libelle)).toEqual({ fonction: 'Agent · Dakar Immo', fiche: '/agents/sokhna%20sene' });
  });

  it('un profil actif l’emporte sur un profil suspendu, quel que soit le métier', () => {
    const profils = [
      profil({ id: 'agent:1', type: 'agent', status: 'suspended', agency: DAKAR_IMMO }),
      profil({ id: 'owner:4', type: 'owner', agency: DAKAR_IMMO }),
    ];
    expect(identiteDuSommaire({ profils }, libelle).fonction).toBe('Propriétaire · Dakar Immo');
  });

  it('l’espace personnel d’un bailleur seul ne se nomme pas ; sans fiche publique, pas de lien', () => {
    const profils = [profil({ id: 'owner:4', type: 'owner', agency: { ...DAKAR_IMMO, name: 'Espace de Awa', kind: 'individual' } })];
    expect(identiteDuSommaire({ profils }, libelle)).toEqual({ fonction: 'Propriétaire', fiche: null });
  });

  it('des profils illisibles, ou aucun profil de métier, ne disent rien', () => {
    expect(identiteDuSommaire({ profils: null }, libelle)).toEqual({ fonction: null, fiche: null });
    expect(identiteDuSommaire({ profils: [] }, libelle)).toEqual({ fonction: null, fiche: null });
  });
});
