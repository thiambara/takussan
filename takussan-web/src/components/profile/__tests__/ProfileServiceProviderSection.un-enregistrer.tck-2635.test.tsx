import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';

/**
 * TCK-2635 — la section prestataire a UN « Enregistrer » (il y en avait quatre, un par réglage), actif
 * sur une modification seulement. Il écrit par les mêmes routes : `PATCH …/trades` avec les seules clés
 * modifiées, `PATCH …/availability` seulement si les disponibilités ont changé.
 */
vi.mock('@/hooks/useProfiles', () => ({
  profilesKeys: { all: ['me', 'profiles'] },
  useMyProfiles: () => ({
    data: { data: [{ id: 'service_provider:5', type: 'service_provider', numeric_id: 5, agency_id: null, status: 'active', created_at: null }], meta: { active_profile_id: 'service_provider:5' } },
  }),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton', user: { id: 3 } }) }));
const API = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/api', async (importOriginal) => ({ ...(await importOriginal<object>()), apiRequest: API.apiRequest }));

import { ProfileServiceProviderSection } from '../ProfileServiceProviderSection';

const REGLAGES = {
  id: 5,
  trades: ['plumbing'],
  intervention_zones: ['Dakar'],
  hourly_rate: '5000.00',
  visit_fee: null,
  available_slots: [],
};

const ecritures = () =>
  API.apiRequest.mock.calls
    .filter(([, o]) => (o as { method?: string } | undefined)?.method === 'PATCH')
    .map(([chemin, o]) => [chemin, (o as { body: unknown }).body]);

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{withIntl(<ProfileServiceProviderSection />)}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  API.apiRequest.mockImplementation(async (_chemin: string, options?: { method?: string }) => {
    if (options?.method === 'PATCH') return { data: REGLAGES };
    return { data: REGLAGES };
  });
});

describe('<ProfileServiceProviderSection> — un seul « Enregistrer » (TCK-2635)', () => {
  it('un seul bouton, inactif tant que rien n’a changé', async () => {
    rendre();
    const boutons = await screen.findAllByRole('button', { name: 'Enregistrer' });
    expect(boutons).toHaveLength(1);
    expect(boutons[0]).toBeDisabled();
  });

  it('zones et tarif modifiés : un seul PATCH …/trades, avec ces clés seulement', async () => {
    const user = userEvent.setup();
    const { container } = rendre();
    await screen.findByRole('button', { name: 'Enregistrer' });
    const zones = container.querySelector<HTMLInputElement>('#sp-profile-zones')!;
    await user.clear(zones);
    await user.type(zones, 'Dakar, Thiès');
    const horaire = container.querySelector<HTMLInputElement>('#sp-profile-hourly')!;
    await user.clear(horaire);
    await user.type(horaire, '6000');
    expect(screen.getByText('2 modifications non enregistrées')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(ecritures()).toHaveLength(1));
    expect(ecritures()).toEqual([
      ['/api/me/profiles/5/trades', { intervention_zones: ['Dakar', 'Thiès'], hourly_rate: 6000, visit_fee: null }],
    ]);
  });

  it('une disponibilité cochée : seul PATCH …/availability part', async () => {
    const user = userEvent.setup();
    rendre();
    await screen.findByRole('button', { name: 'Enregistrer' });
    await user.click(screen.getAllByRole('switch')[0]!);
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(ecritures()).toHaveLength(1));
    const [[chemin, corps]] = ecritures() as [[string, { available_slots: unknown[] }]];
    expect(chemin).toBe('/api/me/profiles/5/availability');
    expect(corps.available_slots).toHaveLength(1);
  });
});
