/**
 * TCK-2775 — le chemin de la demande à travers la VRAIE page : `AdminFinancesClient` lit `?relance=`,
 * la retire de l'adresse, et la passe par `AdminFinancesTabs` jusqu'à l'écran Impayés (ici doublé :
 * ce qu'il en fait est éprouvé par `impayes/__tests__/relance-de-l-adresse.tck-2775.test.tsx`).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { navigationDeTest } from '@/test/navigation-url';
import { withIntl } from '@/test/intl';

import { AdminFinancesClient } from '../AdminFinancesClient';

vi.mock('next/navigation', async () => (await import('@/test/navigation-url')).moduleNavigation);
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'test-token' }) }));
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: true, isLoading: false }) }));
vi.mock('@/components/admin/finances/impayes/Impayes', () => ({
  useResumeDesImpayes: () => null,
  Impayes: ({ relanceDemandee }: { relanceDemandee?: { cible: unknown } | null }) => (
    <div data-testid="impayes">{JSON.stringify(relanceDemandee?.cible ?? null)}</div>
  ),
}));
vi.mock('@/components/admin/finances/argent/PointDuMois', () => ({
  TuilesDuMois: () => null,
  AFaireEtDerniers: () => null,
  PointDuMoisTelephone: () => null,
  lienDOnglet: () => '/app/agency/finances',
}));
vi.mock('@/components/admin/finances/argent/EncaissementsAgence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/admin/finances/argent/EncaissementsAgence')>()),
  EncaissementsAgence: () => null,
}));
vi.mock('@/components/payments/InvoicesTable', () => ({ InvoicesTable: () => null }));
vi.mock('@/components/payments/PayoutsTable', () => ({ PayoutsTable: () => null }));

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [], meta: { current_page: 1, last_page: 0, per_page: 20, total: 0 } }), text: async () => '{}' })));
  vi.spyOn(window.history, 'replaceState').mockImplementation((_etat, _titre, url) => navigationDeTest.replace(String(url ?? '')));
});
afterEach(() => {
  vi.mocked(window.history.replaceState).mockRestore();
  vi.unstubAllGlobals();
  navigationDeTest.reinitialiser('');
});

describe('TCK-2775 — la page passe la demande de l’adresse à l’écran Impayés', () => {
  it('`?tab=impayes&relance=77&bail=177` : l’écran reçoit l’échéance et son bail, l’adresse ne garde que `tab`', async () => {
    navigationDeTest.reinitialiser('tab=impayes&relance=77&bail=177');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(withIntl(<QueryClientProvider client={client}><AdminFinancesClient canViewFinances canEmitFinances agencyId={1} /></QueryClientProvider>));

    await waitFor(() => expect(screen.getByTestId('impayes')).toHaveTextContent('{"genre":"echeance","id":77,"bail":177}'));
    expect(navigationDeTest.requete()).toBe('tab=impayes');
  });
});
