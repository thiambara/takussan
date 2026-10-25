/**
 * P220.05 (TCK-2140) — le filtre d'agent de `/app/properties` nomme l'utilisateur courant par
 * `nomAffichable()`. Avant, un propriétaire particulier sans nom y voyait une option vide.
 */
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

const apiRequest = vi.fn();
const filtres = vi.fn();

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({
  getMeAction: async () => ({
    id: 7,
    first_name: '',
    last_name: '',
    full_name: '',
    email: null,
    phone: '+221770000622',
    roles: ['owner'],
    phone_verified_at: null,
  }),
}));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...a: unknown[]) => apiRequest(...a),
}));
vi.mock('@/components/property-dashboard/PropertyList', () => ({ PropertyList: () => null }));
vi.mock('@/components/property-dashboard/PropertyListFilters', () => ({
  PropertyListFilters: (props: unknown) => {
    filtres(props);
    return null;
  },
}));
vi.mock('@/components/property-dashboard/PropertyPagination', () => ({ PropertyPagination: () => null }));
vi.mock('@/components/contact/AvertissementNumeroNonVerifie', () => ({ AvertissementNumeroNonVerifie: () => null }));

import Page from '../page';

beforeEach(() => {
  apiRequest.mockReset();
  filtres.mockReset();
  apiRequest.mockResolvedValue({ data: [], meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 } });
});

describe('/app/properties — filtre d’agent pour un compte sans nom (P220.05)', () => {
  it('nomme l’utilisateur courant par son numéro', async () => {
    render(withIntl(await Page({ searchParams: Promise.resolve({}) })));

    const { agentOptions } = filtres.mock.calls[0]![0] as { agentOptions: { id: number; name: string }[] };
    expect(agentOptions).toContainEqual({ id: 7, name: '+221 77 000 06 22' });
    expect(agentOptions.every((o) => o.name.trim() !== '')).toBe(true);
  });
});
