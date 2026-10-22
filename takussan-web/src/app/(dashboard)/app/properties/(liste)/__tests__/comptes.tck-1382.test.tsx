/**
 * TCK-1382 (P138.08) — `/app/properties` : « Total » se prend dans `meta.total` de la liste quand
 * aucun filtre autre que la portée n'est posé, et les comptes se font sans `include` ni le sparse
 * fieldset de la liste (`per_page=1`, `fields[properties]=id`).
 *
 * Avant : six `GET /api/properties` par document, dont cinq comptes qui portaient
 * `include=address,owner,collaborators` pour une seule ligne dont seul `meta.total` est lu.
 */
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

const apiRequest = vi.fn();

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({
  getMeAction: async () => ({ id: 7, first_name: 'Awa', last_name: 'Diop', roles: ['agent'], phone_verified_at: '2026-01-01' }),
}));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...a: unknown[]) => apiRequest(...a),
}));
vi.mock('@/components/property-dashboard/PropertyList', () => ({ PropertyList: () => null }));
vi.mock('@/components/property-dashboard/PropertyListFilters', () => ({ PropertyListFilters: () => null }));
vi.mock('@/components/property-dashboard/PropertyPagination', () => ({ PropertyPagination: () => null }));
vi.mock('@/components/contact/AvertissementNumeroNonVerifie', () => ({ AvertissementNumeroNonVerifie: () => null }));

import Page from '../page';

const urls = () => apiRequest.mock.calls.map(([chemin]) => decodeURIComponent(String(chemin)));
const comptes = () => urls().filter((u) => /[?&]per_page=1(&|$)/.test(u));

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (chemin: string) => ({
    data: [],
    meta: { current_page: 1, last_page: 1, per_page: 20, total: /per_page=1(&|$)/.test(decodeURIComponent(chemin)) ? 3 : 42 },
  }));
});

const rendre = async (searchParams: Record<string, string>) =>
  render(withIntl(await Page({ searchParams: Promise.resolve(searchParams) })));

describe('/app/properties — les comptes (TCK-1382)', () => {
  it('sans filtre : « Total » vient de la liste, quatre comptes seulement', async () => {
    const { container } = await rendre({ only_mine: '1' });

    expect(apiRequest).toHaveBeenCalledTimes(5);
    expect(comptes()).toHaveLength(4);
    expect(container.textContent).toContain('42');
  });

  it('les comptes ne portent ni include ni le sparse fieldset de la liste', async () => {
    await rendre({});

    for (const u of comptes()) {
      expect(u).not.toContain('include=');
      expect(u).toContain('fields[properties]=id');
      expect(u).not.toMatch(/fields\[properties\]=id,/);
    }
  });

  it('avec un filtre : « Total » reste compté à part', async () => {
    await rendre({ status: 'sold' });

    expect(apiRequest).toHaveBeenCalledTimes(6);
    expect(comptes()).toHaveLength(5);
  });

  it('avec les archives incluses : « Total » reste compté à part', async () => {
    await rendre({ include_archived: '1' });

    expect(apiRequest).toHaveBeenCalledTimes(6);
  });
});
