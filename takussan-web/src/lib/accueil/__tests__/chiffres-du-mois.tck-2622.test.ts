import { describe, expect, it } from 'vitest';

import { TAB_VALUES } from '@/lib/finances/vue-argent';
import { PASTILLES_GESTION } from '@/lib/biens/mode-de-liste';
import { CHIFFRES_AU_PLUS, chiffresDuMois, LISTES, rapportDuMois } from '../chiffres-du-mois';

/**
 * TCK-2622 — « Ce mois » : chaque chiffre est un LIEN vers la liste qu'il compte, porte ses unités,
 * et se choisit par PERSONA (le client avec une fiche mais sans bail reçoit la vue `tenant` de
 * `/dashboard/me` : il n'a ni « Mes baux » ni « Paiements », AC4).
 */

const AGENCE = {
  properties_total: 82,
  properties_rented: 60,
  leases_active: 92,
  revenue_month: 95_200_000,
  overdue_count: 16,
  overdue_amount: 33_715_000,
  occupancy_rate_percent: 73,
};

describe('admin d’agence', () => {
  it('Encaissé, Impayés (montant + échéances), Occupation, Baux actifs — chacun vers sa liste', () => {
    const c = chiffresDuMois({ persona: 'admin-agence', role: 'agency_admin', metrics: AGENCE, agenceStandard: true });
    expect(c.map((x) => x.cle)).toEqual(['encaisse', 'impayes', 'occupation', 'bauxActifs']);
    const impayes = c.find((x) => x.cle === 'impayes')!;
    expect(impayes).toMatchObject({ valeur: 33_715_000, forme: 'montant', contexte: { cle: 'echeances', n: 16 }, ton: 'danger' });
    // AC2 — vers la liste des impayés : l'onglet « Impayés » d'« Argent », qu'« Argent » sait lire.
    expect(impayes.href).toBe('/app/agency/finances?tab=impayes');
    expect(TAB_VALUES).toContain(new URL(impayes.href, 'http://x').searchParams.get('tab'));
    expect(c.find((x) => x.cle === 'occupation')).toMatchObject({ valeur: 73, forme: 'pourcent', contexte: { cle: 'biensLoues', n: 60 } });
  });

  it('l’hôte (agence individuelle) : l’argent reste sous /app/payments', () => {
    const c = chiffresDuMois({ persona: 'hote', role: 'agency_admin', metrics: AGENCE, agenceStandard: false });
    expect(c.find((x) => x.cle === 'impayes')!.href).toBe('/app/payments?status=late');
    expect(c.find((x) => x.cle === 'encaisse')!.href).toBe('/app/payments?status=paid');
  });

  it('sans les chiffres consolidés (pas de reports.view_agency) : ni Encaissé ni Impayés, jamais à zéro', () => {
    const { revenue_month, overdue_count, overdue_amount, ...sans } = AGENCE;
    void revenue_month;
    void overdue_count;
    void overdue_amount;
    const c = chiffresDuMois({ persona: 'admin-agence', role: 'agency_admin', metrics: sans, agenceStandard: true });
    expect(c.map((x) => x.cle)).toEqual(['occupation', 'bauxActifs', 'biens']);
  });

  it('les KPI personnalisés de l’agence remplacent les chiffres par défaut, dans leur ordre, au plus quatre', () => {
    const kpis = [
      { metric: 'customers_count', label: 'Clients', format: 'number' as const },
      { metric: 'revenue_month', label: 'CA du mois', format: 'currency' as const },
      { metric: 'unpaid_rate_percent', label: 'Taux d’impayés', format: 'percent' as const },
      { metric: 'members_count', label: 'Équipe', format: 'number' as const },
      { metric: 'leases_active', label: 'Baux', format: 'number' as const },
    ];
    const c = chiffresDuMois({
      persona: 'admin-agence',
      role: 'agency_admin',
      metrics: { ...AGENCE, customers_count: 120, members_count: 5, unpaid_rate_percent: 3.9 },
      kpis,
      agenceStandard: true,
    });
    expect(c).toHaveLength(CHIFFRES_AU_PLUS);
    expect(c.map((x) => [x.libelle, x.href, x.forme])).toEqual([
      ['Clients', '/app/customers', 'nombre'],
      ['CA du mois', '/app/agency/finances', 'montant'],
      ['Taux d’impayés', '/app/agency/finances?tab=impayes', 'pourcent'],
      ['Équipe', '/app/agency/team', 'nombre'],
    ]);
  });

  it('un KPI dont la valeur n’est pas servie (chiffres consolidés refusés) n’est pas rendu', () => {
    const c = chiffresDuMois({
      persona: 'admin-agence',
      role: 'agency_admin',
      metrics: { leases_active: 3 },
      kpis: [
        { metric: 'revenue_month', label: 'CA', format: 'currency' },
        { metric: 'leases_active', label: 'Baux', format: 'number' },
      ],
      agenceStandard: true,
    });
    expect(c.map((x) => x.libelle)).toEqual(['Baux']);
  });
});

describe('bailleur', () => {
  it('Biens (loués · libres), Baux actifs, Encaissé (sur … attendus), En retard (échéances)', () => {
    const c = chiffresDuMois({
      persona: 'bailleur',
      role: 'owner',
      metrics: { portfolio_total: 69, portfolio_rented: 14, portfolio_available: 54, leases_active: 14, cashflow_month: 11_400_000, expected_monthly: 18_700_000, overdue_count: 3, overdue_amount: 4_100_000 },
      agenceStandard: false,
    });
    expect(c.map((x) => [x.cle, x.href])).toEqual([
      ['biens', '/app/properties'],
      ['bauxActifs', '/app/leases?status=active'],
      ['encaisse', '/app/payments?status=paid'],
      ['enRetard', '/app/payments?status=late'],
    ]);
    expect(c[0]!.contexte).toEqual({ cle: 'louesLibres', n: 14, libres: 54 });
    expect(c[2]!.contexte).toEqual({ cle: 'surAttendus', montant: 18_700_000 });
    expect(c[3]).toMatchObject({ contexte: { cle: 'echeances', n: 3 }, ton: 'danger' });
  });
});

describe('locataire et client — par persona, jamais par la vue `tenant`', () => {
  const VUE_TENANT = { has_customer_profile: true, leases_active: 0, overdue_count: 0, overdue_amount: 0, next_payment: null, recent_documents: [] };

  it('AC4 — un client avec une fiche mais sans bail : aucun chiffre, donc aucun lien vers /app/leases ni /app/payments', () => {
    expect(chiffresDuMois({ persona: 'client', role: 'tenant', metrics: VUE_TENANT, agenceStandard: false })).toEqual([]);
  });

  it('le locataire garde ses chiffres, en liens', () => {
    const c = chiffresDuMois({
      persona: 'locataire',
      role: 'tenant',
      metrics: { ...VUE_TENANT, leases_active: 1, next_payment: { id: 1, lease_id: 1, amount: 350_000, currency: 'XOF', due_date: '2026-12-05', status: 'pending' } },
      agenceStandard: false,
    });
    expect(c.map((x) => x.href)).toEqual(['/app/leases', '/app/payments', '/app/payments', '/app/documents']);
    expect(c[1]).toMatchObject({ valeur: 350_000, contexte: { cle: 'leJour', jour: '2026-12-05' } });
  });

  it('l’agent n’a pas de « Ce mois » ici : sa journée porte ses chiffres', () => {
    expect(chiffresDuMois({ persona: 'agent', role: 'agent', metrics: { properties_managed: 3 }, agenceStandard: true })).toEqual([]);
  });
});

describe('les liens', () => {
  it('les filtres de biens sont ceux que les pastilles du mode Gestion lisent', () => {
    const occupancy = new Set<string | null>(PASTILLES_GESTION.map((p) => ('occupancy' in p.params ? p.params.occupancy : null)));
    for (const href of [LISTES.biensOccupes, LISTES.biensVacants]) {
      const q = new URL(href, 'http://x').searchParams;
      expect(q.get('mode')).toBe('gestion');
      expect(occupancy.has(q.get('occupancy'))).toBe(true);
    }
  });

  it('« Voir le rapport du mois » : l’admin et le bailleur, pas le locataire', () => {
    expect(rapportDuMois('agency_admin')).toBe('/app/reports');
    expect(rapportDuMois('owner')).toBe('/app/reports');
    expect(rapportDuMois('tenant')).toBeNull();
  });
});
