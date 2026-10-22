/**
 * TCK-1289 (P131.02) — les tuiles de « Mes biens » gardent la portée de la liste (`only_mine=1`
 * ou `user_id`) sous laquelle leurs nombres sont comptés, et « Vendus / loués » ouvre les deux
 * statuts qu'elle compte.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({
  getMeAction: async () => ({ id: 7, first_name: 'Awa', last_name: 'Diop', roles: ['agent'], phone_verified_at: '2026-01-01' }),
}));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/queries/properties-server', () => ({
  fetchDashboardProperties: async () => ({
    data: [],
    meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 },
  }),
  countDashboardProperties: async () => 0,
}));
vi.mock('@/components/property-dashboard/PropertyList', () => ({ PropertyList: () => null }));
vi.mock('@/components/property-dashboard/PropertyListFilters', () => ({ PropertyListFilters: () => null }));
vi.mock('@/components/property-dashboard/PropertyPagination', () => ({ PropertyPagination: () => null }));
vi.mock('@/components/contact/AvertissementNumeroNonVerifie', () => ({ AvertissementNumeroNonVerifie: () => null }));

import Page from '../page';

async function tuiles(searchParams: Record<string, string>) {
  render(withIntl(await Page({ searchParams: Promise.resolve(searchParams) })));
  const bande = screen.getByRole('navigation');
  return within(bande).getAllByRole('link').map((a) => ({
    href: a.getAttribute('href'),
    actif: a.getAttribute('aria-current') === 'true',
  }));
}

describe('/app/properties — liens des tuiles (TCK-1289)', () => {
  it('sous « mes biens », les quatre tuiles gardent `only_mine=1`', async () => {
    expect((await tuiles({ only_mine: '1' })).map((t) => t.href)).toEqual([
      '/app/properties?only_mine=1',
      '/app/properties?visibility=public&only_mine=1',
      '/app/properties?status=sold,rented&only_mine=1',
      '/app/properties?include_archived=1&status=archived&only_mine=1',
    ]);
  });

  it('sous un agent choisi, les tuiles gardent son `user_id`', async () => {
    expect((await tuiles({ user_id: '12' })).map((t) => t.href)).toEqual([
      '/app/properties?user_id=12',
      '/app/properties?visibility=public&user_id=12',
      '/app/properties?status=sold,rented&user_id=12',
      '/app/properties?include_archived=1&status=archived&user_id=12',
    ]);
  });

  it('sans portée, les liens restent ceux de toute la liste', async () => {
    expect((await tuiles({})).map((t) => t.href)).toEqual([
      '/app/properties',
      '/app/properties?visibility=public',
      '/app/properties?status=sold,rented',
      '/app/properties?include_archived=1&status=archived',
    ]);
  });

  it('« Vendus / loués » est active pour `status=sold,rented`', async () => {
    const liste = await tuiles({ status: 'sold,rented' });
    expect(liste[2]).toEqual({ href: '/app/properties?status=sold,rented', actif: true });
  });
});
