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
 * TCK-633 (lot B, AC1) — la table des pages `/admin/*` et ce qu'on en tire.
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
  '/admin/agency',
  '/admin/agency/kyc',
  '/admin/agency/billing',
  '/admin/finances',
  '/admin/finances/reconciliation',
  '/admin/settings/integrations',
];

describe('PAGES_ADMIN', () => {
  it('déclare chaque chemin une fois, tous sous /admin', () => {
    const chemins = PAGES_ADMIN.map((p) => p.chemin);
    expect(new Set(chemins).size).toBe(chemins.length);
    for (const c of chemins) expect(c === '/admin' || c.startsWith('/admin/')).toBe(true);
  });

  it("garde l'ordre du menu d'avant TCK-633", () => {
    expect(PAGES_ADMIN.filter((p) => p.menu !== null).map((p) => p.chemin)).toEqual([
      '/admin',
      '/admin/properties',
      '/admin/team',
      '/admin/roles',
      '/admin/agency',
      '/admin/agency/kyc',
      '/admin/agency/billing',
      '/admin/finances',
      '/admin/moderation',
      '/admin/moderation/properties',
      '/admin/audit',
      '/admin/settings/integrations',
      '/admin/settings',
    ]);
  });
});

describe('pageAccessible / accesDepuis', () => {
  it('le tableau de bord admin est refusé au solo', () => {
    expect(pageAccessible(PAGES_ADMIN[0], SOLO)).toBe(false);
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
    expect(chemins).not.toContain('/admin');
    expect(chemins[0]).toBe('/admin/agency');
  });

  it('capacités inconnues : la page à capacité est refusée', () => {
    expect(accesDepuis({ ...STANDARD, capacites: null }).chemins).not.toContain('/admin/agency/billing');
  });

  it("sans agence rattachée, l'exigence « standard » ne bloque pas (comme AgencyKindGuard)", () => {
    expect(accesDepuis({ ...STANDARD, agence: null }).chemins).toContain('/admin');
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
    expect(entreeAdmin(accesDepuis(SOLO))).toEqual({ href: '/admin/agency', cle: 'mySpace' });
  });

  it('standard : « Administration » vers /admin', () => {
    expect(entreeAdmin(accesDepuis(STANDARD))).toEqual({ href: '/admin', cle: 'sectionLabel' });
  });

  it('aucune page : aucune entrée', () => {
    expect(entreeAdmin({ chemins: [], espaceIndividuel: false })).toBeNull();
  });
});

describe('entreesDeMenu / liensDuProfil', () => {
  it("le menu du solo, sans la page qui n'a pas d'entrée (rapprochement)", () => {
    expect(entreesDeMenu(accesDepuis(SOLO)).map((e) => [e.chemin, e.cle])).toEqual([
      ['/admin/agency', 'agency'],
      ['/admin/agency/kyc', 'kyc'],
      ['/admin/agency/billing', 'billing'],
      ['/admin/finances', 'finances'],
      ['/admin/settings/integrations', 'integrations'],
    ]);
  });

  it('les liens du profil ne mènent qu’à des pages accessibles', () => {
    expect(liensDuProfil(accesDepuis(SOLO))).toEqual([{ chemin: '/admin/agency', cle: 'manageAgency' }]);
    expect(liensDuProfil(accesDepuis(STANDARD))).toEqual([
      { chemin: '/admin/agency', cle: 'manageAgency' },
      { chemin: '/admin/audit', cle: 'auditLog' },
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
