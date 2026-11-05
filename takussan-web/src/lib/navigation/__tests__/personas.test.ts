import { describe, expect, it } from 'vitest';
import type { UserRole } from '@/types/user';
import type { ProfileType } from '@/types/profile';
import { resoudrePersona, typeDuProfilActif, type Persona } from '../personas';

describe('TCK-2477 — typeDuProfilActif', () => {
  it.each<[string | undefined, ProfileType | null]>([
    ['agency_admin:12', 'agency_admin'],
    ['owner:3', 'owner'],
    ['agent:4', 'agent'],
    ['service_provider:9', 'service_provider'],
    ['platform:1', null],
    ['', null],
    [undefined, null],
  ])('%s → %s', (cookie, attendu) => {
    expect(typeDuProfilActif(cookie)).toBe(attendu);
  });
});

describe('TCK-2477 — resoudrePersona (ADR-0089 §2)', () => {
  it.each<[string, UserRole[], ProfileType | null, boolean, Persona]>([
    ['client', ['customer'], null, false, 'client'],
    ['locataire', ['customer', 'tenant'], null, false, 'locataire'],
    ['bailleur', ['customer', 'owner'], null, false, 'bailleur'],
    ['agent', ['customer', 'agent'], null, false, 'agent'],
    ['admin d’agence standard', ['customer', 'agency_admin'], null, false, 'admin-agence'],
    ['admin d’agence individuelle', ['customer', 'agency_admin', 'owner'], null, true, 'hote'],
    ['bailleur de son agence individuelle', ['customer', 'agency_admin', 'owner'], 'owner', true, 'hote'],
    ['prestataire', ['customer', 'service_provider'], null, false, 'prestataire'],
    ['super-admin sans profil actif', ['customer', 'super_admin'], null, false, 'plateforme'],
    // Le cas qui motive l'ADR : un admin ET bailleur d'une même agence standard.
    ['admin+bailleur, profil actif admin', ['customer', 'agency_admin', 'owner'], 'agency_admin', false, 'admin-agence'],
    ['admin+bailleur, profil actif bailleur', ['customer', 'agency_admin', 'owner'], 'owner', false, 'bailleur'],
    ['agent+bailleur, profil actif bailleur', ['customer', 'agent', 'owner'], 'owner', false, 'bailleur'],
    // Un cookie périmé (profil suspendu, absent de `roles`) ne décide de rien.
    ['cookie périmé', ['customer', 'agent'], 'owner', false, 'agent'],
    ['super-admin dans un espace d’agence', ['customer', 'super_admin', 'agency_admin'], 'agency_admin', false, 'admin-agence'],
  ])('%s', (_, roles, typeProfilActif, agenceIndividuelle, attendu) => {
    expect(resoudrePersona({ roles, typeProfilActif, agenceIndividuelle })).toBe(attendu);
  });
});
