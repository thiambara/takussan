import { describe, expect, it } from 'vitest';
import { composerMenu } from '../composer-menu';
import type { Persona } from '../personas';
import type { ContexteDeMenu } from '../types';

const TOUTES_LES_PAGES_D_AGENCE = [
  '/app/agency/team', '/app/agency/roles', '/app/agency', '/app/agency/kyc', '/app/agency/billing',
  '/app/agency/finances', '/app/agency/moderation', '/app/agency/moderation/properties',
  '/app/agency/audit', '/app/agency/integrations',
];
const PAGES_DE_L_HOTE = ['/app/agency', '/app/agency/kyc', '/app/agency/billing', '/app/agency/finances', '/app/agency/integrations'];

const COMPTES: Record<Persona, ContexteDeMenu> = {
  client: { roles: ['customer'], capacites: null },
  locataire: { roles: ['customer', 'tenant'], capacites: null },
  bailleur: { roles: ['customer', 'owner'], capacites: null },
  agent: { roles: ['customer', 'agent'], capacites: ['properties.create'] },
  'admin-agence': { roles: ['customer', 'agency_admin'], capacites: ['properties.create'], cheminsAdmin: TOUTES_LES_PAGES_D_AGENCE },
  hote: { roles: ['customer', 'agency_admin', 'owner'], capacites: ['properties.create'], cheminsAdmin: PAGES_DE_L_HOTE },
  prestataire: { roles: ['customer', 'service_provider'], capacites: [] },
  plateforme: { roles: ['customer', 'super_admin'], capacites: [], cheminsAdmin: TOUTES_LES_PAGES_D_AGENCE },
};

/** `[action, carte, [groupe, titre, replié, ids…]…]` — lu sur le menu composé, rien d'autre. */
function lecture(persona: Persona) {
  const menu = composerMenu(COMPTES[persona], persona);
  return {
    action: menu.action ? [menu.action.id, menu.action.labelKey] : null,
    carte: menu.carte?.id ?? null,
    groupes: menu.groupes.map((g) => [g.id, g.titre, g.replie, ...g.entrees.map((e) => e.id)]),
  };
}

describe('TCK-2478 — les dispositions validées par le porteur le 2026-11-05', () => {
  it('client', () => {
    expect(lecture('client')).toEqual({
      action: ['chercher-bien', 'searchProperty'],
      carte: 'publier-annonce',
      groupes: [
        ['tete', null, false, 'tableau-de-bord', 'messagerie'],
        ['mes-recherches', 'mesRecherches', false, 'favoris', 'recherches'],
        ['mes-demarches', 'mesDemarches', false, 'visites', 'reservations'],
        // Arbitrage 1 : les quatre derniers restent accessibles au client pur.
        ['plus', 'plus', true, 'documents', 'avis', 'statistiques', 'maintenance', 'baux', 'paiements', 'etats-des-lieux'],
      ],
    });
  });

  it('locataire', () => {
    expect(lecture('locataire')).toEqual({
      action: ['paiements', 'payRent'],
      carte: 'publier-annonce',
      groupes: [
        ['tete', null, false, 'tableau-de-bord', 'messagerie'],
        ['mon-logement', 'monLogement', false, 'baux', 'paiements', 'maintenance', 'etats-des-lieux', 'documents'],
        ['mes-recherches', 'mesRecherches', true, 'chercher-bien', 'favoris', 'recherches', 'visites', 'reservations'],
        ['plus', 'plus', true, 'avis', 'statistiques'],
      ],
    });
  });

  it('bailleur', () => {
    expect(lecture('bailleur')).toEqual({
      action: ['proposer-bien', 'proposeProperty'],
      carte: null,
      groupes: [
        ['tete', null, false, 'tableau-de-bord', 'messagerie'],
        ['mon-patrimoine', 'monPatrimoine', false, 'mes-biens', 'baux', 'paiements', 'etats-des-lieux'],
        ['activite', 'activite', false, 'demandes', 'visites', 'reservations', 'calendrier', 'maintenance'],
        ['plus', 'plus', true, 'clients', 'avis', 'documents', 'statistiques', 'exports', 'favoris', 'recherches', 'taches'],
      ],
    });
  });

  it('agent', () => {
    expect(lecture('agent')).toEqual({
      action: ['publier-bien', 'publishProperty'],
      carte: null,
      groupes: [
        ['tete', null, false, 'tableau-de-bord', 'messagerie', 'taches'],
        ['prospection', 'prospection', false, 'demandes', 'clients', 'visites', 'calendrier'],
        ['catalogue', 'catalogue', false, 'mes-biens', 'reservations'],
        ['gestion', 'gestion', false, 'baux', 'entrees-en-attente', 'etats-des-lieux', 'maintenance', 'commissions'],
        ['plus', 'plus', true, 'avis', 'documents', 'statistiques', 'exports', 'favoris', 'recherches'],
      ],
    });
  });

  it('admin d’agence standard', () => {
    expect(lecture('admin-agence')).toEqual({
      action: ['publier-bien', 'publishProperty'],
      carte: null,
      groupes: [
        ['tete', null, false, 'tableau-de-bord', 'vue-agence', 'messagerie'],
        ['activite', 'activite', false, 'demandes', 'visites', 'reservations', 'calendrier'],
        ['portefeuille', 'portefeuille', false, 'mes-biens', 'proprietaires', 'clients', 'baux', 'entrees-en-attente'],
        ['finances', 'finances', false, 'agence-finances', 'commissions', 'credits', 'agence-facturation'],
        ['agence', 'agence', true, 'agence-equipe', 'agence-roles', 'agence-fiche', 'agence-kyc', 'agence-moderation-avis', 'agence-moderation-biens', 'agence-journal', 'agence-integrations'],
        ['pilotage', 'pilotage', true, 'statistiques', 'kpis', 'alertes', 'exports'],
        ['plus', 'plus', true, 'maintenance', 'carnet-prestataires', 'etats-des-lieux', 'documents', 'avis', 'taches', 'favoris', 'recherches'],
      ],
    });
  });

  it('hôte', () => {
    expect(lecture('hote')).toEqual({
      action: ['publier-bien', 'publishProperty'],
      carte: null,
      groupes: [
        ['tete', null, false, 'tableau-de-bord', 'messagerie'],
        ['mes-biens', 'mesBiens', false, 'mes-biens', 'reservations', 'visites', 'calendrier', 'demandes'],
        ['mes-locations', 'mesLocations', false, 'baux', 'agence-finances', 'etats-des-lieux', 'maintenance', 'carnet-prestataires'],
        ['mon-espace', 'monEspace', false, 'agence-fiche', 'agence-kyc', 'agence-facturation', 'credits', 'agence-integrations'],
        // Arbitrage 4 : les paiements du bailleur, libellés « Paiements ».
        ['plus', 'plus', true, 'clients', 'statistiques', 'exports', 'kpis', 'alertes', 'avis', 'documents', 'taches', 'favoris', 'recherches', 'paiements', 'commissions', 'entrees-en-attente', 'vue-agence', 'proprietaires'],
      ],
    });
  });

  it('prestataire : aucune action, quatre entrées en tête', () => {
    const { action, groupes } = lecture('prestataire');
    expect(action).toBeNull();
    expect(groupes[0]).toEqual(['tete', null, false, 'tableau-de-bord', 'maintenance', 'messagerie', 'documents']);
  });

  it('plateforme : la disposition de l’admin d’agence', () => {
    expect(lecture('plateforme').groupes.map((g) => g[0])).toEqual(lecture('admin-agence').groupes.map((g) => g[0]));
  });
});
