/**
 * TCK-595, AC20 ter — les vues d'ensemble formatent dans la langue de la REQUÊTE.
 *
 * Les quatre pages passaient `'fr'` (et `'fr-SN'` pour les heures de la vue agent) en dur : sous des
 * libellés anglais, un montant sortait `150 000 F CFA` et une date `1 juil. 2026`. Le test simule la
 * locale servie par next-intl et lit le texte rendu.
 *
 * Le mock de `getTranslations` interpole les `{valeurs}` simples : sans cela, le sous-titre qui porte
 * la date de début de période rendrait son gabarit brut et l'assertion sur `1 Jul 2026` ne lirait
 * rien.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const etat = vi.hoisted(() => ({ locale: 'fr' }));

vi.mock('next-intl/server', async () => {
  const base = (await import('@/test/intl')).mockTraductionsServeur();
  return {
    ...base,
    getLocale: async () => etat.locale,
    getTranslations: async (namespace?: string) => {
      const t = await base.getTranslations(namespace);
      return (cle: string, valeurs?: Record<string, string | number>) =>
        t(cle).replace(/\{(\w+)\}/g, (brut, nom: string) =>
          valeurs && nom in valeurs ? String(valeurs[nom]) : brut);
    },
  };
});
vi.mock('@/components/charts/BarChart', () => ({ BarChart: () => null }));
vi.mock('@/components/charts/LineChart', () => ({ LineChart: () => null }));
vi.mock('@/lib/session', () => ({ getToken: vi.fn(async () => null) }));
vi.mock('@/app/actions/auth', () => ({
  getMeAction: vi.fn(async () => ({ id: 7, roles: ['owner'] })),
}));
vi.mock('@/lib/queries/dashboard', () => ({
  fetchOwnerDashboard: vi.fn(async () => ({
    data: {
      owner_id: 7,
      period: { start: '2026-07-01', end: '2026-07-31' },
      portfolio: { total: 3, rented: 1, available: 2 },
      leases: { active: 1 },
      bookings: { pending: 0 },
      finance: { cashflow_month: 150000, expected_monthly: 0, overdue_count: 0, overdue_amount: 0 },
      occupancy: { rate_percent: 33.33 },
      maintenance: { quotes_pending: 0 },
      visits: { to_confirm: 0 },
      reviews: { unanswered: 0 },
    },
  })),
  fetchAgentDashboard: vi.fn(async () => ({
    data: {
      agent_id: 7,
      agency_id: 1,
      scope: 'mine',
      period: { start: '2026-07-01', end: '2026-07-31' },
      properties_managed: 0,
      pipeline: {},
      tasks: { open: 0, overdue: 0, items: [] },
      pipeline_ops: { pending_bookings: 0, leases_to_sign: 0, tasks_today: 0 },
      finance: { commissions_month: 150000, commissions_year: 150000 },
      visits: {
        upcoming_7d: 1,
        today_items: [
          {
            id: 9,
            scheduled_at: '2026-07-15T18:00:00Z',
            status: 'confirmed',
            property: { id: 1, title: 'Villa Almadies' },
            requester: { name: 'Awa' },
          },
        ],
      },
      recent_activity: [],
    },
  })),
  fetchMyCapabilities: vi.fn(async () => []),
}));

import OwnerDashboardPage from '../owner/page';
import AgentDashboardPage from '../agent/page';

// Espace fine insécable (U+202F) : le séparateur de milliers de `fr-SN`. Entre le nombre et le
// symbole, `formatCurrency` pose une espace insécable (U+00A0) dans les deux langues.
const FR_150K = '150\u202F000\u00A0F CFA';
const EN_150K = '150,000\u00A0F CFA';

beforeEach(() => {
  etat.locale = 'fr';
});

describe('vue bailleur — la langue de la requête (AC20 ter)', () => {
  it('en anglais : montant et date anglais, plus rien de français', async () => {
    etat.locale = 'en';
    const { container } = render(await OwnerDashboardPage());
    const texte = container.textContent ?? '';

    expect(texte).toContain(EN_150K);
    expect(texte).toContain('1 Jul 2026');
    expect(texte).not.toContain(FR_150K);
    expect(texte).not.toContain('juil.');
  });

  it('en français : rendu inchangé, caractère pour caractère', async () => {
    const { container } = render(await OwnerDashboardPage());
    const texte = container.textContent ?? '';

    expect(texte).toContain(FR_150K);
    expect(texte).toContain('1 juil. 2026');
  });
});

describe('vue agent — la tuile Commissions et l’heure de visite (AC20 ter)', () => {
  it('en anglais', async () => {
    etat.locale = 'en';
    const { container } = render(await AgentDashboardPage());
    const texte = container.textContent ?? '';

    expect(texte).toContain(EN_150K);
    expect(texte).not.toContain(FR_150K);
    expect(screen.getByRole('link', { name: /Villa Almadies/ }).textContent).toContain('18:00');
  });

  it('en français', async () => {
    const { container } = render(await AgentDashboardPage());
    const texte = container.textContent ?? '';

    expect(texte).toContain(FR_150K);
    // Fuseau `Africa/Dakar` (UTC+0) : 18 h UTC se lit 18:00, quelle que soit la machine.
    expect(screen.getByRole('link', { name: /Villa Almadies/ }).textContent).toContain('18:00');
  });
});

describe('aucune locale figée dans la source des quatre pages', () => {
  const PAGES = ['agency', 'agent', 'owner', 'tenant'];

  /** Retire les commentaires : un docblock peut citer `'fr'` sans rien figer. */
  function code(page: string): string {
    const source = readFileSync(join(__dirname, '..', page, 'page.tsx'), 'utf8');
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  }

  it.each(PAGES)('%s/page.tsx ne passe ni « fr » ni « fr-SN »', (page) => {
    expect(code(page)).not.toMatch(/['"`]fr(?:-SN)?['"`]/);
  });
});
