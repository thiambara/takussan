import { describe, expect, it } from 'vitest';

import {
  PAGES_ADMIN,
  accesDepuis,
  contexteDeRepli,
  entreeAdmin,
  entreesDeMenu,
  liensDuProfil,
  pageAccessible,
  type ContexteAdmin,
} from '../pages-admin';

/**
 * TCK-633 (lot B, AC1) — la table des pages d'administration et ce qu'on en tire. TCK-649 — leurs
 * chemins vivent sous `/app/agency` (ADR-0064 §1) ; aucune exigence n'a bougé.
 *
 * Chaque propriété est écrite pour rougir sur la régression qu'elle garde : une ligne qui perd son
 * exigence `standard`, un super-admin qui cesse de tout ouvrir, un « je ne sais pas » lu comme « oui ».
 */
const SOLO: ContexteAdmin = {
  roles: ['agency_admin', 'owner', 'customer'],
  agence: { kind: 'individual' },
  capacites: ['agency.update_billing'],
};
const STANDARD: ContexteAdmin = {
  roles: ['agency_admin', 'customer'],
  agence: { kind: 'standard' },
  capacites: ['agency.update_billing'],
};
const SUPER_ADMIN: ContexteAdmin = { roles: ['super_admin'], agence: null, capacites: [] };

const PAGES_DU_SOLO = [
  '/app/agency',
  '/app/agency/kyc',
  '/app/agency/billing',
  '/app/agency/finances',
  '/app/agency/finances/reconciliation',
  '/app/agency/integrations',
];

describe('PAGES_ADMIN', () => {
  it('déclare chaque chemin une fois, tous dans la section d’agence de /app (TCK-649)', () => {
    const chemins = PAGES_ADMIN.map((p) => p.chemin as string);
    expect(new Set(chemins).size).toBe(chemins.length);
    for (const c of chemins) expect(c === '/app/agency' || c.startsWith('/app/agency/')).toBe(true);
  });

  // TCK-649 (ADR-0064 §1) — la correspondance de l'ADR, ligne à ligne, ET les exigences de TCK-633
  // inchangées : un déplacement qui changerait une règle au passage rougit ici.
  it('suit la table de l’ADR-0064 §1 sans changer une exigence', () => {
    expect(PAGES_ADMIN.map((p) => [p.chemin, p.exige])).toEqual([
      ['/app/agency/team', { role: 'admin', agence: 'standard' }],
      ['/app/agency/roles', { role: 'admin', agence: 'standard' }],
      ['/app/agency', { role: 'admin' }],
      ['/app/agency/kyc', { role: 'admin' }],
      ['/app/agency/billing', { role: 'admin', capacite: 'agency.update_billing' }],
      ['/app/agency/finances', { role: 'admin' }],
      ['/app/agency/finances/reconciliation', { role: 'admin' }],
      ['/app/agency/moderation', { role: 'admin', agence: 'standard' }],
      ['/app/agency/moderation/properties', { role: 'admin', agence: 'standard' }],
      ['/app/agency/audit', { role: 'admin', agence: 'standard' }],
      ['/app/agency/integrations', { role: 'admin' }],
    ]);
  });

  it("garde l'ordre du menu d'avant TCK-633", () => {
    expect(PAGES_ADMIN.filter((p) => p.menu !== null).map((p) => p.chemin)).toEqual([
      '/app/agency/team',
      '/app/agency/roles',
      '/app/agency',
      '/app/agency/kyc',
      '/app/agency/billing',
      '/app/agency/finances',
      '/app/agency/moderation',
      '/app/agency/moderation/properties',
      '/app/agency/audit',
      '/app/agency/integrations',
    ]);
  });

  // TCK-648 (ADR-0064 §1) — les deux pages du super-admin ont quitté la table : l'éditeur de la
  // table `settings` (supprimé depuis, TCK-651), la liste transverse des biens à
  // `/super-admin/properties`. Plus aucune ligne de la table n'exige `super_admin`.
  it("ne porte plus aucune page du super-admin (TCK-648)", () => {
    expect(PAGES_ADMIN.filter((p) => p.exige.role === 'super_admin')).toEqual([]);
  });
});

// TCK-647 (ADR-0064 §3) — le tableau de bord de l'agence est `/app/overview/agency`, gardé par son
// layout : il n'est pas une ligne de la table.
it("ne porte pas le tableau de bord de l'agence (TCK-647)", () => {
  expect(PAGES_ADMIN.map((p) => p.chemin as string)).not.toContain('/app/overview/agency');
});

describe('pageAccessible / accesDepuis', () => {
  it('une page « standard » est refusée au solo', () => {
    expect(pageAccessible(PAGES_ADMIN.find((p) => p.chemin === '/app/agency/team')!, SOLO)).toBe(false);
  });

  it("un solo n'a que les pages sans exigence « standard », et c'est un espace individuel", () => {
    expect(accesDepuis(SOLO)).toEqual({ chemins: PAGES_DU_SOLO, espaceIndividuel: true });
  });

  it("un admin standard garde toutes les pages d'admin, sauf celles du super-admin", () => {
    const acces = accesDepuis(STANDARD);
    expect(acces.chemins).toEqual(
      PAGES_ADMIN.filter((p) => p.exige.role === 'admin').map((p) => p.chemin),
    );
    expect(acces.espaceIndividuel).toBe(false);
  });

  it('le super-admin ouvre tout, même rattaché à une agence individual (comme AgencyKindGuard)', () => {
    expect(accesDepuis(SUPER_ADMIN).chemins).toEqual(PAGES_ADMIN.map((p) => p.chemin));
    const dansUnSolo = accesDepuis({ ...SUPER_ADMIN, agence: { kind: 'individual' } });
    expect(dansUnSolo.chemins).toEqual(PAGES_ADMIN.map((p) => p.chemin));
    expect(dansUnSolo.espaceIndividuel).toBe(false);
  });

  it('kind inconnu : les pages « standard » sont refusées (fail-closed)', () => {
    const chemins = accesDepuis({ ...STANDARD, agence: { kind: null } }).chemins;
    expect(chemins).not.toContain('/app/agency/team');
    expect(chemins[0]).toBe('/app/agency');
  });

  it('capacités inconnues : la page à capacité est refusée', () => {
    expect(accesDepuis({ ...STANDARD, capacites: null }).chemins).not.toContain('/app/agency/billing');
  });

  it("sans agence rattachée, l'exigence « standard » ne bloque pas (comme AgencyKindGuard)", () => {
    expect(accesDepuis({ ...STANDARD, agence: null }).chemins).toContain('/app/agency/team');
  });

  it("un compte sans rôle d'admin n'a rien", () => {
    expect(accesDepuis({ roles: ['owner', 'customer'], agence: null, capacites: [] })).toEqual({
      chemins: [],
      espaceIndividuel: false,
    });
  });
});

describe('entreeAdmin', () => {
  it('solo : « Mon espace » vers sa première page', () => {
    expect(entreeAdmin(accesDepuis(SOLO))).toEqual({ href: '/app/agency', cle: 'mySpace' });
  });

  // TCK-647 — le tableau de bord a quitté la table : l'entrée mène à la première page restante.
  it('standard : « Administration » vers sa première page, /app/agency/team', () => {
    expect(entreeAdmin(accesDepuis(STANDARD))).toEqual({ href: '/app/agency/team', cle: 'sectionLabel' });
  });

  it('aucune page : aucune entrée', () => {
    expect(entreeAdmin({ chemins: [], espaceIndividuel: false })).toBeNull();
  });
});

describe('entreesDeMenu / liensDuProfil', () => {
  it("le menu du solo, sans la page qui n'a pas d'entrée (rapprochement)", () => {
    expect(entreesDeMenu(accesDepuis(SOLO)).map((e) => [e.chemin, e.cle])).toEqual([
      ['/app/agency', 'agency'],
      ['/app/agency/kyc', 'kyc'],
      ['/app/agency/billing', 'billing'],
      ['/app/agency/finances', 'finances'],
      ['/app/agency/integrations', 'integrations'],
    ]);
  });

  it('les liens du profil ne mènent qu’à des pages accessibles', () => {
    expect(liensDuProfil(accesDepuis(SOLO))).toEqual([{ chemin: '/app/agency', cle: 'manageAgency' }]);
    expect(liensDuProfil(accesDepuis(STANDARD))).toEqual([
      { chemin: '/app/agency', cle: 'manageAgency' },
      { chemin: '/app/agency/audit', cle: 'auditLog' },
    ]);
  });
});

describe('contexteDeRepli — ce que les composants client déduisent sans fournisseur', () => {
  it('pas d’agence : agence nulle, capacités inconnues', () => {
    expect(contexteDeRepli({ roles: ['agency_admin'], agencyId: null })).toEqual({
      roles: ['agency_admin'],
      agence: null,
      capacites: null,
    });
  });

  it('le kind vient du drapeau, et « inconnu » reste inconnu', () => {
    expect(contexteDeRepli({ roles: ['agency_admin'], agencyId: 7, agencyIsStandard: true }).agence)
      .toEqual({ kind: 'standard' });
    expect(contexteDeRepli({ roles: ['agency_admin'], agencyIsStandard: false }).agence)
      .toEqual({ kind: 'individual' });
    expect(contexteDeRepli({ roles: ['agency_admin'], agencyId: 7 }).agence).toEqual({ kind: null });
  });
});
