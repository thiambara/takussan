/**
 * TCK-2896 — le module pur du coffre de l'agence : l'alerte d'un dossier (au jour de Dakar), la clé
 * d'URL d'un dossier et ce qu'elle retrouve, le découpage des générés d'un bail.
 */
import { describe, expect, it } from 'vitest';

import { alerteDuDossier, cleDuDossier, rangeDansLeDossier, resumeDuBien, trouverLeDossier, type CoffreDeLAgence } from '../coffre-de-l-agence';

const comptes = (c: Partial<{ documents: number; expiring_soon: number; unverified: number; next_expiry_date: string | null }>) => ({
  documents: 3,
  expiring_soon: 0,
  unverified: 0,
  next_expiry_date: null,
  ...c,
});

describe('alerteDuDossier', () => {
  it('une seule expiration dit son nombre de jours ; plusieurs, non', () => {
    expect(alerteDuDossier(comptes({ expiring_soon: 1, unverified: 1, next_expiry_date: '2026-12-25' }), '2026-11-13')).toEqual({ expire: { n: 1, jours: 42 }, aVerifier: 1 });
    expect(alerteDuDossier(comptes({ expiring_soon: 2, next_expiry_date: '2026-12-25' }), '2026-11-13')).toEqual({ expire: { n: 2, jours: null }, aVerifier: 0 });
    expect(alerteDuDossier(comptes({ expiring_soon: 1, next_expiry_date: '2026-11-13' }), '2026-11-13')).toEqual({ expire: { n: 1, jours: 0 }, aVerifier: 0 });
  });

  it('rien à signaler : `null`', () => {
    expect(alerteDuDossier(comptes({}), '2026-11-13')).toBeNull();
  });
});

describe('cleDuDossier et trouverLeDossier', () => {
  const coffre: CoffreDeLAgence = {
    agency: { id: 3 },
    totals: comptes({ documents: 4 }),
    properties: [
      {
        id: 5,
        title: 'Villa',
        neighborhood: null,
        ...comptes({ documents: 4 }),
        folders: [{ key: 'property_pieces', kind: 'uploaded', target: { type: 'property', id: 5 }, ...comptes({ documents: 1 }) }],
        leases: [
          {
            id: 12,
            reference_number: 'LS-1',
            status: 'active',
            start_date: null,
            tenant: { name: 'Ousmane Niang' },
            ...comptes({}),
            folders: [{ key: 'tenant_pieces', kind: 'uploaded', target: { type: 'lease', id: 12 }, ...comptes({}) }],
          },
        ],
      },
    ],
    agency_folder: { key: 'agency_pieces', kind: 'uploaded', target: { type: 'agency', id: 3 }, ...comptes({ documents: 0 }) },
  };

  it('retrouve le dossier, son bien et son bail ; une clé inconnue ne retrouve rien', () => {
    const trouve = trouverLeDossier(coffre, 'lease-12-tenant_pieces');
    expect(trouve?.dossier.key).toBe('tenant_pieces');
    expect(trouve?.bien?.id).toBe(5);
    expect(trouve?.bail?.id).toBe(12);
    expect(trouverLeDossier(coffre, cleDuDossier(coffre.agency_folder))?.bien).toBeNull();
    expect(trouverLeDossier(coffre, 'lease-99-tenant_pieces')).toBeNull();
    expect(trouverLeDossier(coffre, null)).toBeNull();
  });

  it('le résumé d’un bien à un seul bail nomme son locataire', () => {
    expect(resumeDuBien(coffre.properties[0])).toEqual({ cle: 'unBail', locataire: 'Ousmane Niang', documents: 4 });
  });
});

describe('rangeDansLeDossier — le découpage de l’API (`countOf`)', () => {
  it.each([
    ['contract', 'lease_contract', true],
    ['inventories', 'inventory_move_out', true],
    ['receipts', 'receipt_deposit', true],
    ['receipts', 'lease_contract', false],
    ['tenant_pieces', 'receipt_rent', false],
  ] as const)('%s ← %s : %s', (cle, categorie, attendu) => {
    expect(rangeDansLeDossier(cle, categorie)).toBe(attendu);
  });
});
