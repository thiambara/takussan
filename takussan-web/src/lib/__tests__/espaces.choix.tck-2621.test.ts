/**
 * TCK-2621 — quand l'écran « Choisir un espace » se montre, et ce qu'une ligne d'espace affiche.
 */
import { describe, expect, it } from 'vitest';
import { doitChoisirUnEspace, nombreDAgences, sigleDAgence, sousLigneDEspace } from '@/lib/espaces';
import type { Profile } from '@/types/profile';

const profil = (id: string, agencyId: number | null, nom = `Agence ${agencyId}`): Profile => ({
  id,
  type: id.split(':')[0] as Profile['type'],
  numeric_id: Number(id.split(':')[1]),
  agency_id: agencyId,
  agency: agencyId === null ? undefined : { id: agencyId, name: nom, slug: `agence-${agencyId}`, kind: 'standard' },
  status: 'active',
  created_at: null,
});

const DEUX_AGENCES = [profil('agent:5', 1, 'Dakar Immo'), profil('owner:9', 2, 'Thiès Properties')];
const base = { profilLie: null, enImpersonation: false, choixClient: undefined, userId: 176, profils: DEUX_AGENCES };

describe('doitChoisirUnEspace', () => {
  it('deux agences, aucun profil lié : l’écran se montre', () => {
    expect(doitChoisirUnEspace(base)).toBe(true);
  });

  it('une seule agence (deux profils) : jamais — l’API auto-bascule', () => {
    expect(doitChoisirUnEspace({ ...base, profils: [profil('agency_admin:3', 1), profil('owner:9', 1)] })).toBe(false);
  });

  it('un profil déjà lié (cookie ou dernier espace retenu) : jamais', () => {
    expect(doitChoisirUnEspace({ ...base, profilLie: 'owner:9' })).toBe(false);
  });

  it('pendant une impersonation : jamais', () => {
    expect(doitChoisirUnEspace({ ...base, enImpersonation: true })).toBe(false);
  });

  it('« Continuer en tant que client » dans la session : plus pour CE compte, encore pour un autre', () => {
    expect(doitChoisirUnEspace({ ...base, choixClient: '176' })).toBe(false);
    expect(doitChoisirUnEspace({ ...base, choixClient: '12' })).toBe(true);
  });

  it('un profil sans agence (prestataire) ne compte pas pour une agence', () => {
    expect(nombreDAgences([profil('agent:5', 1), profil('service_provider:2', null)])).toBe(1);
    expect(doitChoisirUnEspace({ ...base, profils: [profil('agent:5', 1), profil('service_provider:2', null)] })).toBe(false);
  });
});

describe('ce qu’une ligne d’espace affiche', () => {
  it('« rôle · ville », et le rôle seul sans ville — jamais un séparateur pendant', () => {
    expect(sousLigneDEspace('Agent', 'Dakar')).toBe('Agent · Dakar');
    expect(sousLigneDEspace('Agent', null)).toBe('Agent');
    expect(sousLigneDEspace('Agent', undefined)).toBe('Agent');
    expect(sousLigneDEspace('Agent', '  ')).toBe('Agent');
  });

  it('le sigle : les initiales des deux premiers mots', () => {
    expect(sigleDAgence('Dakar Immo')).toBe('DI');
    expect(sigleDAgence('Thiès Properties')).toBe('TP');
    expect(sigleDAgence('Keur Ndiaye & Fils')).toBe('KN');
    expect(sigleDAgence('l’Agence du Fleuve')).toBe('LA');
    expect(sigleDAgence('Teranga')).toBe('T');
  });
});
