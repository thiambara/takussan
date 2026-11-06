import { describe, expect, it } from 'vitest';
import { composerMenu } from '../composer-menu';
import { DISPOSITIONS } from '../dispositions';
import { PERSONAS, type Persona } from '../personas';
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
        ['tete', null, false, 'messagerie'],
        ['mes-recherches', 'mesRecherches', false, 'favoris', 'recherches'],
        ['mes-demarches', 'mesDemarches', false, 'visites', 'reservations'],
        ['tableau-de-bord', null, false, 'tableau-de-bord'],
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
        ['tete', null, false, 'messagerie'],
        ['mon-logement', 'monLogement', false, 'baux', 'paiements', 'maintenance', 'etats-des-lieux', 'documents'],
        ['mes-recherches', 'mesRecherches', true, 'chercher-bien', 'favoris', 'recherches', 'visites', 'reservations'],
        ['tableau-de-bord', null, false, 'tableau-de-bord'],
        ['plus', 'plus', true, 'avis', 'statistiques'],
      ],
    });
  });

  it('bailleur', () => {
    expect(lecture('bailleur')).toEqual({
      action: ['proposer-bien', 'proposeProperty'],
      carte: null,
      groupes: [
        ['tete', null, false, 'messagerie'],
        ['mon-patrimoine', 'monPatrimoine', false, 'mes-biens', 'baux', 'paiements', 'etats-des-lieux'],
        ['activite', 'activite', false, 'demandes', 'visites', 'reservations', 'calendrier', 'maintenance'],
        ['tableau-de-bord', null, false, 'tableau-de-bord'],
        ['plus', 'plus', true, 'clients', 'avis', 'documents', 'statistiques', 'exports', 'favoris', 'recherches', 'taches'],
      ],
    });
  });

  it('agent', () => {
    expect(lecture('agent')).toEqual({
      action: ['publier-bien', 'publishProperty'],
      carte: null,
      groupes: [
        ['tete', null, false, 'messagerie', 'taches'],
        ['prospection', 'prospection', false, 'demandes', 'clients', 'visites', 'calendrier'],
        ['catalogue', 'catalogue', false, 'mes-biens', 'reservations'],
        ['tableau-de-bord', null, false, 'tableau-de-bord'],
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
        ['tete', null, false, 'messagerie'],
        ['mes-biens', 'mesBiens', false, 'mes-biens', 'reservations', 'visites', 'calendrier', 'demandes'],
        ['mes-locations', 'mesLocations', false, 'baux', 'agence-finances', 'etats-des-lieux', 'maintenance', 'carnet-prestataires'],
        ['tableau-de-bord', null, false, 'tableau-de-bord'],
        ['mon-espace', 'monEspace', false, 'agence-fiche', 'agence-kyc', 'agence-facturation', 'credits', 'agence-integrations'],
        // Arbitrage 4 : les paiements du bailleur, libellés « Paiements ».
        ['plus', 'plus', true, 'clients', 'statistiques', 'exports', 'kpis', 'alertes', 'avis', 'documents', 'taches', 'favoris', 'recherches', 'paiements', 'commissions', 'entrees-en-attente', 'vue-agence', 'proprietaires'],
      ],
    });
  });

  it('prestataire : aucune action, quatre entrées en tête, le tableau de bord en quatrième (TCK-2489)', () => {
    const { action, groupes } = lecture('prestataire');
    expect(action).toBeNull();
    expect(groupes[0]).toEqual(['tete', null, false, 'maintenance', 'messagerie', 'documents', 'tableau-de-bord']);
  });

  it('plateforme : la disposition de l’admin d’agence, le tableau de bord après « Portefeuille » (TCK-2489)', () => {
    const admin = lecture('admin-agence').groupes.map((g) => g[0]);
    const plateforme = lecture('plateforme').groupes;
    expect(plateforme.map((g) => g[0])).toEqual([...admin.slice(0, 3), 'tableau-de-bord', ...admin.slice(3)]);
    expect(plateforme[0]).toEqual(['tete', null, false, 'vue-agence', 'messagerie']);
    expect(plateforme[3]).toEqual(['tableau-de-bord', null, false, 'tableau-de-bord']);
  });
});

/**
 * TCK-2489 (ADR-0090 §4) — la place du « Tableau de bord », par persona. Deux lectures : la RÈGLE,
 * recalculée sur la disposition (les groupes titrés), et la PLACE, lue sur le menu composé.
 */
describe('TCK-2489 — le tableau de bord n’ouvre le menu que pour l’admin d’agence', () => {
  /** Où la règle du ticket place l'entrée : après quel groupe titré, ou à quelle ligne de la tête. */
  function placeAttendue(persona: Persona): { readonly apres: string | null; readonly ligne: number | null } {
    if (persona === 'admin-agence') return { apres: null, ligne: 0 };
    const titres = DISPOSITIONS[persona].groupes.filter((g) => g.titre !== null && g.id !== 'tableau-de-bord');
    if (titres.length === 0) return { apres: null, ligne: 3 };
    return { apres: titres[Math.min(2, titres.length) - 1].id, ligne: null };
  }

  it.each(PERSONAS)('AC1 — %s : la place de la règle, dans la disposition', (persona) => {
    const groupes = DISPOSITIONS[persona].groupes;
    const { apres, ligne } = placeAttendue(persona);
    const porteurs = groupes.filter((g) => g.entrees.includes('tableau-de-bord'));
    expect(porteurs, 'une seule fois').toHaveLength(1);
    if (apres === null) {
      // admin d'agence : première ligne de la tête ; prestataire : quatrième ligne de la tête.
      expect(groupes[0].titre).toBeNull();
      expect(groupes[0].entrees.indexOf('tableau-de-bord')).toBe(ligne);
      return;
    }
    // Les autres : un groupe sans titre, à lui seul, juste après le groupe titré que la règle désigne.
    const i = groupes.findIndex((g) => g.id === apres);
    expect(groupes[i + 1]).toEqual({ id: 'tableau-de-bord', titre: null, entrees: ['tableau-de-bord'] });
  });

  it.each(PERSONAS)('AC1 — %s : la place lue sur le menu composé', (persona) => {
    const ids = composerMenu(COMPTES[persona], persona).groupes.flatMap((g) => g.entrees.map((e) => e.id));
    const rang = ids.indexOf('tableau-de-bord');
    expect(rang, 'le tableau de bord reste au menu').toBeGreaterThanOrEqual(0);
    if (persona === 'admin-agence') expect(rang).toBe(0);
    else expect(rang, 'jamais en tête').toBeGreaterThan(0);
  });

  it('la table, persona par persona', () => {
    const table = Object.fromEntries(
      PERSONAS.map((p) => {
        const menu = composerMenu(COMPTES[p], p);
        const g = menu.groupes.findIndex((x) => x.entrees.some((e) => e.id === 'tableau-de-bord'));
        return [p, [menu.groupes[g - 1]?.id ?? null, menu.groupes[g].id, menu.groupes[g].entrees.findIndex((e) => e.id === 'tableau-de-bord')]];
      }),
    );
    // [groupe précédent, groupe porteur, rang dans le groupe]
    expect(table).toEqual({
      client: ['mes-demarches', 'tableau-de-bord', 0],
      locataire: ['mes-recherches', 'tableau-de-bord', 0],
      bailleur: ['activite', 'tableau-de-bord', 0],
      agent: ['catalogue', 'tableau-de-bord', 0],
      'admin-agence': [null, 'tete', 0],
      hote: ['mes-locations', 'tableau-de-bord', 0],
      prestataire: [null, 'tete', 3],
      plateforme: ['portefeuille', 'tableau-de-bord', 0],
    });
  });

  it.each(PERSONAS)('%s : la page d’arrivée et les onglets mobiles ne changent pas (« Tableau de bord » en premier onglet)', (persona) => {
    expect(DISPOSITIONS[persona].onglets[0]).toBe('tableau-de-bord');
  });
});
