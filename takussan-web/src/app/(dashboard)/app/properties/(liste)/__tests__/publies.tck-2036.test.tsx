/**
 * TCK-2036 (P198.03) — « Publiés » de `/app/properties` compte la règle du catalogue
 * (`Property::public()`, TCK-1115), celle de l'accueil d'agence, par `filter[public]=1` : la tuile,
 * son lien et l'avertissement de numéro non vérifié. Avant, `filter[visibility]=public` gardait les
 * biens loués, vendus ou en revue restés publics.
 */
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

const apiRequest = vi.fn();
const avertissement = vi.fn();

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({
  getMeAction: async () => ({ id: 7, first_name: 'Awa', last_name: 'Diop', roles: ['agent'], phone_verified_at: null }),
}));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...a: unknown[]) => apiRequest(...a),
}));
vi.mock('@/components/property-dashboard/PropertyList', () => ({ PropertyList: () => null }));
vi.mock('@/components/property-dashboard/PropertyListFilters', () => ({ PropertyListFilters: () => null }));
vi.mock('@/components/property-dashboard/PropertyPagination', () => ({ PropertyPagination: () => null }));
vi.mock('@/components/contact/AvertissementNumeroNonVerifie', () => ({
  AvertissementNumeroNonVerifie: (props: { annoncesEnLigne: number }) => {
    avertissement(props);
    return null;
  },
}));

import Page from '../page';

const urls = () => apiRequest.mock.calls.map(([chemin]) => decodeURIComponent(String(chemin)));

beforeEach(() => {
  apiRequest.mockReset();
  avertissement.mockReset();
  apiRequest.mockImplementation(async (chemin: string) => {
    const u = decodeURIComponent(chemin);
    const total = !/per_page=1(&|$)/.test(u) ? 42 : u.includes('filter[public]=1') ? 0 : 5;
    return { data: [], meta: { current_page: 1, last_page: 1, per_page: 20, total } };
  });
});

async function rendre(searchParams: Record<string, string>) {
  render(withIntl(await Page({ searchParams: Promise.resolve(searchParams) })));
  return within(screen.getByRole('navigation')).getAllByRole('link');
}

describe('/app/properties — « Publiés » selon la règle du catalogue (P198.03)', () => {
  it('compte par `filter[public]=1`, jamais par `filter[visibility]=public`', async () => {
    await rendre({});

    expect(urls().filter((u) => u.includes('filter[public]=1'))).toHaveLength(1);
    expect(urls().some((u) => u.includes('filter[visibility]=public'))).toBe(false);
  });

  it("l'avertissement de numéro non vérifié lit le même compte", async () => {
    await rendre({});

    expect(avertissement).toHaveBeenCalledWith(expect.objectContaining({ annoncesEnLigne: 0 }));
  });

  it('la tuile ouvre `public=1`, que la liste relaie à l’API, et y est active', async () => {
    const liens = await rendre({ public: '1', only_mine: '1' });

    expect(liens[1].getAttribute('href')).toBe('/app/properties?public=1&only_mine=1');
    expect(liens[1].getAttribute('aria-current')).toBe('true');
    expect(liens[0].getAttribute('aria-current')).not.toBe('true');
    const liste = urls().find((u) => !/per_page=1(&|$)/.test(u));
    expect(liste).toContain('filter[public]=1');
  });
});
