import { describe, expect, it } from 'vitest';

import {
  ANCIENNES_ADRESSES,
  cibleDeLAncienneAdresse,
  hrefDeLOnglet,
  indicateursOuverts,
  ongletDeLAdresse,
  ongletOuvert,
  ongletDeLaPersona,
  ongletsDesRapports,
  rapportsOuverts,
} from '../rapports';

/**
 * TCK-2628 (ADR-0096 § 3 et § 4, ADR-0089 amendement du 2026-11-10 § 2 et § 3) — la table des onglets de
 * « Rapports », la seule que lisent la barre, les gardes, les redirections et le catalogue.
 */
/** L'admin d'une agence `standard` : les deux pages d'origine ouvertes, et `reports.view_agency`. */
const ADMIN = {
  persona: 'admin-agence',
  cheminsAdmin: ['/app/agency', '/app/agency/team', '/app/agency/finances'],
  capacites: ['reports.view_agency'],
} as const;

describe('TCK-2628 — les onglets par persona', () => {
  it('admin d’agence, agent, bailleur : les onglets exacts, dans l’ordre (AC1)', () => {
    expect(ongletsDesRapports(ADMIN)).toEqual(['ensemble', 'equipe', 'impayes', 'exports', 'alertes']);
    expect(ongletsDesRapports({ persona: 'agent' })).toEqual(['ensemble', 'commissions', 'pipeline', 'exports']);
    expect(ongletsDesRapports({ persona: 'bailleur' })).toEqual(['ensemble', 'reversements', 'exports']);
  });

  it('l’hôte garde « Alertes » (TCK-284, décision 1 a) ; le super-admin, ce qu’il ouvrait', () => {
    expect(ongletsDesRapports({ persona: 'hote' })).toEqual(['ensemble', 'reversements', 'exports', 'alertes']);
    expect(ongletsDesRapports({ persona: 'plateforme' })).toEqual(['ensemble', 'exports', 'alertes']);
  });

  it.each(['locataire', 'client', 'prestataire'] as const)('%s : pas de « Rapports » (AC6)', (persona) => {
    expect(ongletsDesRapports({ persona })).toEqual([]);
    expect(rapportsOuverts({ persona })).toBe(false);
    expect(indicateursOuverts({ persona })).toBe(false);
  });
});

describe('TCK-2628 — Équipe et Impayés gardent la garde de leur page d’origine', () => {
  it('sans la page d’équipe, ou sans `reports.view_agency`, pas d’onglet Équipe', () => {
    expect(ongletsDesRapports({ ...ADMIN, cheminsAdmin: ['/app/agency', '/app/agency/finances'] })).toEqual([
      'ensemble', 'impayes', 'exports', 'alertes',
    ]);
    expect(ongletsDesRapports({ ...ADMIN, capacites: [] })).toEqual(['ensemble', 'impayes', 'exports', 'alertes']);
  });

  it('sans la page des finances, pas d’onglet Impayés', () => {
    expect(ongletsDesRapports({ ...ADMIN, cheminsAdmin: ['/app/agency', '/app/agency/team'] })).toEqual([
      'ensemble', 'equipe', 'exports', 'alertes',
    ]);
  });

  it('accès inconnus ou capacités illisibles : fermés, jamais ouverts par défaut', () => {
    expect(ongletsDesRapports({ persona: 'admin-agence' })).toEqual(['ensemble', 'exports', 'alertes']);
    expect(ongletsDesRapports({ ...ADMIN, capacites: null })).toEqual(['ensemble', 'impayes', 'exports', 'alertes']);
  });
});

describe('TCK-2628 — le module `analytics` masque des onglets (AC3)', () => {
  it('admin : ni Exports ni Alertes, ni les indicateurs ; la vue d’ensemble et « Rapports » restent', () => {
    const contexte = { ...ADMIN, modulesMasques: ['analytics'] } as const;
    expect(ongletsDesRapports(contexte)).toEqual(['ensemble', 'equipe', 'impayes']);
    expect(indicateursOuverts(contexte)).toBe(false);
    expect(rapportsOuverts(contexte)).toBe(true);
  });

  it('agent : sans Exports ; `commissions` masque aussi son analyse des commissions', () => {
    expect(ongletsDesRapports({ persona: 'agent', modulesMasques: ['analytics'] })).toEqual(['ensemble', 'commissions', 'pipeline']);
    expect(ongletsDesRapports({ persona: 'agent', modulesMasques: ['commissions'] })).toEqual(['ensemble', 'pipeline', 'exports']);
  });

  it('le bailleur et l’hôte ne sont pas du personnel : le masque ne les touche pas (TCK-2483)', () => {
    expect(ongletsDesRapports({ persona: 'bailleur', modulesMasques: ['analytics'] })).toEqual(['ensemble', 'reversements', 'exports']);
    expect(ongletsDesRapports({ persona: 'hote', modulesMasques: ['analytics'] })).toEqual(['ensemble', 'reversements', 'exports', 'alertes']);
    expect(indicateursOuverts({ persona: 'hote', modulesMasques: ['analytics'] })).toBe(true);
  });
});

describe('TCK-2628 — les anciennes adresses (ADR-0096 § 4)', () => {
  it('AC2 — la vue agent en portée « Agence » mène à la vue d’ensemble de l’agent, portée gardée', () => {
    expect(cibleDeLAncienneAdresse('/app/overview/agent', { persona: 'agent' }, { scope: 'agency' })).toBe('/app/reports?scope=agency');
    expect(cibleDeLAncienneAdresse('/app/overview/agent', { persona: 'agent' }, { scope: 'mine' })).toBe('/app/reports');
    // Une portée qui n'est pas une valeur unique ne passe pas.
    expect(cibleDeLAncienneAdresse('/app/overview/agent', { persona: 'agent' }, { scope: ['agency', 'agency'] })).toBe('/app/reports');
  });

  it('chaque adresse vers son onglet ; un onglet masqué mène à la vue d’ensemble (AC3)', () => {
    const admin = ADMIN;
    expect(cibleDeLAncienneAdresse('/app/overview/agency', admin)).toBe('/app/reports');
    expect(cibleDeLAncienneAdresse('/app/overview/kpis', admin)).toBe('/app/reports/indicators');
    expect(cibleDeLAncienneAdresse('/app/overview/alerts', admin)).toBe('/app/reports/alerts');
    expect(cibleDeLAncienneAdresse('/app/overview/exports', admin)).toBe('/app/reports/exports');
    const masque = { ...ADMIN, modulesMasques: ['analytics'] } as const;
    expect(cibleDeLAncienneAdresse('/app/overview/alerts', masque)).toBe('/app/reports');
    expect(cibleDeLAncienneAdresse('/app/overview/exports', masque)).toBe('/app/reports');
    expect(cibleDeLAncienneAdresse('/app/overview/kpis', masque)).toBe('/app/reports');
    // L'agent n'a jamais eu les alertes : la vue d'ensemble, pas une page vide.
    expect(cibleDeLAncienneAdresse('/app/overview/alerts', { persona: 'agent' })).toBe('/app/reports');
    // La portée ne passe qu'à la vue de l'agent.
    expect(cibleDeLAncienneAdresse('/app/overview/agency', admin, { scope: 'agency' })).toBe('/app/reports');
  });

  it.each(['locataire', 'client', 'prestataire'] as const)('%s : toute ancienne adresse mène à /app (AC6)', (persona) => {
    for (const adresse of ANCIENNES_ADRESSES) expect(cibleDeLAncienneAdresse(adresse, { persona }, { scope: 'agency' })).toBe('/app');
  });
});

describe('TCK-2628 — l’onglet d’une adresse', () => {
  it('le préfixe le plus long ; les indicateurs n’allument aucun onglet', () => {
    expect(ongletDeLAdresse('/app/reports')).toBe('ensemble');
    expect(ongletDeLAdresse('/app/reports/alerts')).toBe('alertes');
    expect(ongletDeLAdresse('/app/reports/payouts')).toBe('reversements');
    expect(ongletDeLAdresse('/app/reports/indicators')).toBeNull();
    expect(ongletDeLAdresse('/app/reportsx')).toBeNull();
    expect(ongletDeLAdresse('/app')).toBeNull();
  });
});

describe('TCK-2628 — la portée suit les onglets de l’agent qui la lisent', () => {
  it('ensemble, commissions et pipeline la portent ; exports non', () => {
    expect(hrefDeLOnglet('ensemble', 'agency')).toBe('/app/reports?scope=agency');
    expect(hrefDeLOnglet('commissions', 'agency')).toBe('/app/reports/commissions?scope=agency');
    expect(hrefDeLOnglet('pipeline', 'agency')).toBe('/app/reports/pipeline?scope=agency');
    expect(hrefDeLOnglet('exports', 'agency')).toBe('/app/reports/exports');
    expect(hrefDeLOnglet('commissions')).toBe('/app/reports/commissions');
  });

  it('la table de la persona, sans le masque ni la page d’origine (ce que juge une garde)', () => {
    expect(ongletDeLaPersona('equipe', 'admin-agence')).toBe(true);
    expect(ongletOuvert('equipe', { persona: 'admin-agence' })).toBe(false);
    expect(ongletDeLaPersona('equipe', 'agent')).toBe(false);
    expect(ongletDeLaPersona('exports', 'agent')).toBe(true);
    expect(ongletOuvert('exports', { persona: 'agent', modulesMasques: ['analytics'] })).toBe(false);
  });
});
