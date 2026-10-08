import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { aDesChiffres, type DashboardMePayload } from '../dashboard-me';

/**
 * TCK-595 (verif-595 m5) — `/dashboard/me` ne rend plus 404. Un compte neuf ou un prestataire pur reçoit
 * la vue client SANS fiche client : l'accueil doit garder son état vide, pas des tuiles locataire à zéro.
 */
const payload = (role: DashboardMePayload['role'], metrics: Record<string, unknown>) => ({
  data: { role, metrics, sections: [] },
});

describe('aDesChiffres — l’accueil a-t-il des chiffres à montrer', () => {
  it('un compte sans fiche client (neuf, prestataire pur) garde l’état vide', () => {
    expect(aDesChiffres(payload('tenant', { has_customer_profile: false, leases_active: 0 }))).toBe(false);
  });

  it('un client avec une fiche, et toute autre vue, montrent leurs tuiles', () => {
    expect(aDesChiffres(payload('tenant', { has_customer_profile: true, leases_active: 1 }))).toBe(true);
    expect(aDesChiffres(payload('owner', { portfolio_total: 2 }))).toBe(true);
    expect(aDesChiffres(payload('agency_admin', { properties_total: 2 }))).toBe(true);
  });

  it('sans réponse, l’état vide', () => {
    expect(aDesChiffres(null)).toBe(false);
  });

  it('l’accueil emploie bien ce prédicat pour choisir entre tuiles et état vide', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/(dashboard)/app/(accueil)/page.tsx'), 'utf8');
    expect(source).toContain('{aDesChiffres(payload) ? (');
    expect(source).toContain('<DashboardEmpty roles={user.roles} />');
  });
});
