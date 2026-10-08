/**
 * TCK-591 §9 (front) — « Ajouter un client » et le lien vers le pipeline sont des gestes du
 * personnel : un bailleur garde la lecture de ses fiches, sans l'entrée de création ni le kanban.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
const me = vi.hoisted(() => ({ roles: ['agent'] as string[] }));
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => ({ id: 1, roles: me.roles }) }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
const liste = vi.hoisted(() => ({ data: [] as unknown[] }));
vi.mock('@/lib/queries/customers', () => ({
  fetchDashboardCustomers: async () => ({
    data: liste.data,
    meta: { current_page: 1, last_page: 1, per_page: 20, total: liste.data.length },
  }),
  fetchCrmTags: async () => [],
}));
vi.mock('@/components/customer-dashboard/CustomerListFilters', () => ({ CustomerListFilters: () => null }));
vi.mock('@/components/property-dashboard/PropertyPagination', () => ({ PropertyPagination: () => null }));

import Page from '../page';

async function rendu() {
  render(withIntl(await Page({ searchParams: Promise.resolve({}) })));
}

const liens = () => screen.queryAllByRole('link').map((a) => a.getAttribute('href'));

describe('/app/customers — entrées réservées au personnel (TCK-591 §9)', () => {
  beforeEach(() => {
    liste.data = [];
  });

  it('un agent voit « Ajouter un client » et le pipeline', async () => {
    me.roles = ['agent'];
    await rendu();
    expect(liens()).toEqual(expect.arrayContaining(['/app/crm/pipeline', '/app/customers/new']));
  });

  it('un bailleur ne les voit pas, même sur la liste vide', async () => {
    me.roles = ['owner'];
    await rendu();
    expect(liens()).not.toContain('/app/crm/pipeline');
    expect(liens()).not.toContain('/app/customers/new');
  });
});
