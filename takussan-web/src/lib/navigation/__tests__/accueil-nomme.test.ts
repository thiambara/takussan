import { describe, expect, it } from 'vitest';

import { PROFILE_TYPES, type ProfileType } from '@/types/profile';
import { USER_ROLES, type UserRole } from '@/types/user';
import { accueilNommeAujourdhui } from '../accueil-nomme';
import { DISPOSITIONS } from '../dispositions';
import { resoudrePersona } from '../personas';

/** Tous les sous-ensembles de rôles : la garde porte sur le produit cartésien, pas sur des exemples. */
function sousEnsembles(roles: readonly UserRole[]): UserRole[][] {
  return roles.reduce<UserRole[][]>((acc, role) => [...acc, ...acc.map((s) => [...s, role])], [[]]);
}

describe('TCK-2619 — « Retour à Aujourd’hui », décidé au serveur', () => {
  it('l’agent seul voit son accueil nommé « Aujourd’hui » ; l’admin, le bailleur, le client non', () => {
    expect(accueilNommeAujourdhui({ roles: ['customer', 'agent'], typeProfilActif: 'agent' })).toBe(true);
    expect(accueilNommeAujourdhui({ roles: ['customer', 'agent'] })).toBe(true);
    expect(accueilNommeAujourdhui({ roles: ['customer', 'agency_admin'] })).toBe(false);
    expect(accueilNommeAujourdhui({ roles: ['customer', 'owner'] })).toBe(false);
    expect(accueilNommeAujourdhui({ roles: ['customer'] })).toBe(false);
    // Le profil actif l'emporte sur le rôle dominant : l'agent qui est aussi admin, sous son profil d'agent.
    expect(accueilNommeAujourdhui({ roles: ['customer', 'agency_admin', 'agent'], typeProfilActif: 'agent' })).toBe(true);
    expect(accueilNommeAujourdhui({ roles: ['customer', 'agency_admin', 'agent'], typeProfilActif: 'agency_admin' })).toBe(false);
  });

  it('`agenceIndividuelle`, que le serveur ne connaît pas, ne change la réponse pour AUCUN compte', () => {
    const nomme = (roles: UserRole[], typeProfilActif: ProfileType | null, agenceIndividuelle: boolean) =>
      DISPOSITIONS[resoudrePersona({ roles, typeProfilActif, agenceIndividuelle })].libelles?.['tableau-de-bord'] === 'today';
    const divergents: string[] = [];
    for (const roles of sousEnsembles(USER_ROLES)) {
      for (const type of [null, ...PROFILE_TYPES] as (ProfileType | null)[]) {
        if (nomme(roles, type, true) !== nomme(roles, type, false)) divergents.push(`${roles.join('+')} / ${type}`);
      }
    }
    expect(divergents).toEqual([]);
  });
});
