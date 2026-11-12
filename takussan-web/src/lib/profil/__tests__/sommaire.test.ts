import { describe, expect, it } from 'vitest';

import type { Profile } from '@/types/profile';
import type { UserRole } from '@/types/user';
import {
  HREF_DE_LA_RANGEE,
  HREF_SUPPRESSION,
  aRegler,
  rangeeDuChemin,
  rangeesAPoint,
  rangeesDuSommaire,
  type FaitsDuSommaire,
} from '../sommaire';

/**
 * TCK-2635 — le sommaire du profil : les rangées exactes par persona, « À régler » sur des faits rendus
 * par l'API seulement, et l'adresse qui ouvre chaque section.
 */
function compte(roles: UserRole[], autre: Partial<FaitsDuSommaire['user']> = {}): FaitsDuSommaire['user'] {
  return {
    roles,
    phone: '+221778040289',
    phone_verified_at: '2026-01-01T00:00:00Z',
    two_factor_enabled: true,
    listed_in_public_directory: false,
    timezone: 'Africa/Dakar',
    ...autre,
  };
}

const AGENT_COMPLET: Profile = {
  id: 'agent:1',
  type: 'agent',
  numeric_id: 1,
  agency_id: 1,
  status: 'active',
  created_at: null,
  languages: ['fr', 'wo'],
  neighborhood_ids: [3, 4],
};

describe('TCK-2635 — les rangées du sommaire, par persona', () => {
  const COMMUNES = ['coordonnees', 'notifications', 'securite', 'espaces', 'menu', 'langue', 'fuseau', 'avis', 'donnees'];
  const avec = (...propres: string[]) => {
    // L'ordre de la maquette : les rangées propres au persona suivent les coordonnées.
    return ['coordonnees', ...propres, ...COMMUNES.slice(1)];
  };

  it.each<[string, UserRole[], string[]]>([
    ['agent', ['agent', 'customer'], avec('fiche', 'pro')],
    ['bailleur', ['owner', 'customer'], avec('versement', 'annuaire')],
    ['prestataire', ['service_provider', 'customer'], avec('pro', 'versement')],
    ['client', ['customer'], avec('recherche')],
    ['admin d’agence', ['agency_admin', 'customer'], avec()],
    ['agent et bailleur', ['agent', 'owner'], avec('fiche', 'pro', 'versement')],
  ])('%s', (_nom, roles, attendues) => {
    expect(rangeesDuSommaire({ user: compte(roles) })).toEqual(attendues);
  });

  it('« Supprimer mon compte » n’est pas une rangée : il ferme le sommaire, à sa propre adresse', () => {
    for (const roles of [['agent'], ['owner'], ['customer']] as UserRole[][]) {
      expect(rangeesDuSommaire({ user: compte(roles) })).not.toContain('suppression');
    }
    expect(Object.values(HREF_DE_LA_RANGEE).map((r) => r.href)).not.toContain(HREF_SUPPRESSION);
  });
});

describe('TCK-2635 — « À régler », sur des faits seulement', () => {
  it('« Vérifier votre numéro » si et seulement si le téléphone renseigné n’est pas vérifié', () => {
    const ids = (user: FaitsDuSommaire['user']) => aRegler({ user, profils: [] }).map((a) => a.id);
    expect(ids(compte(['customer'], { phone_verified_at: null }))).toContain('telephone');
    expect(ids(compte(['customer']))).not.toContain('telephone');
    // Sans numéro, il n'y a rien à vérifier : la rangée le dit (« Aucun numéro »), sans point.
    expect(ids(compte(['customer'], { phone: null, phone_verified_at: null }))).not.toContain('telephone');
  });

  it('la double authentification inactive est à régler pour l’agent et l’admin d’agence, pas pour le client', () => {
    const ids = (roles: UserRole[]) => aRegler({ user: compte(roles, { two_factor_enabled: false }), profils: [] }).map((a) => a.id);
    expect(ids(['agent'])).toContain('double-authentification');
    expect(ids(['agency_admin'])).toContain('double-authentification');
    expect(ids(['customer'])).not.toContain('double-authentification');
    expect(ids(['owner'])).not.toContain('double-authentification');
    expect(aRegler({ user: compte(['agent']), profils: [AGENT_COMPLET] })).toEqual([]);
  });

  it('la fiche publique de l’agent sans langue ou sans quartier est à compléter ; des profils illisibles n’en disent rien', () => {
    const ids = (profils: Profile[] | null) => aRegler({ user: compte(['agent']), profils }).map((a) => a.id);
    expect(ids([AGENT_COMPLET])).not.toContain('fiche');
    expect(ids([{ ...AGENT_COMPLET, languages: [] }])).toContain('fiche');
    expect(ids([{ ...AGENT_COMPLET, neighborhood_ids: [] }])).toContain('fiche');
    expect(ids(null)).not.toContain('fiche');
  });

  it('chaque chose à régler marque sa rangée d’un point', () => {
    const liste = aRegler({ user: compte(['agent'], { phone_verified_at: null, two_factor_enabled: false }), profils: [{ ...AGENT_COMPLET, languages: [] }] });
    expect([...rangeesAPoint(liste)].sort()).toEqual(['coordonnees', 'fiche', 'securite']);
  });
});

describe('TCK-2635 — chaque adresse ouvre sa section', () => {
  it('les adresses d’avant le ticket ouvrent « Mes avis », « Notifications » et « Mes données »', () => {
    expect(rangeeDuChemin('/app/profile/reviews')).toBe('avis');
    expect(rangeeDuChemin('/app/profile/notifications')).toBe('notifications');
    expect(rangeeDuChemin('/app/account/privacy')).toBe('donnees');
    expect(rangeeDuChemin('/app/profile/reviews?onglet=recus')).toBe('avis');
  });

  it('le sommaire lui-même et une adresse hors du profil n’ouvrent aucune section', () => {
    expect(rangeeDuChemin('/app/profile')).toBeNull();
    expect(rangeeDuChemin('/app/leases')).toBeNull();
    expect(rangeeDuChemin(HREF_SUPPRESSION)).toBeNull();
  });
});
