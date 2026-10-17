import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { MiseEnService } from '../MiseEnService';

/**
 * TCK-777 (P15.08) — sur l'accueil, la carte sert aussi l'agence `individual` : ses étapes y sont
 * filtrées par `kind`. Une étape dont l'écran est refusé à une agence individuelle (la table des
 * pages, `PAGES_ADMIN` : `agence: 'standard'`) n'y est ni montrée ni comptée — sinon l'hôte solo
 * aurait une étape impossible, et la carte ne disparaîtrait jamais.
 */
const apiRequest = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));

const CLES = [
  'kyc_verified',
  'logo',
  'commission_rate',
  'payment_integration',
  'first_member',
  'first_published_property',
  'admin_two_factor',
] as const;

function monter(kind: 'standard' | 'individual', client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={client}>
      {withIntl(<MiseEnService agencyId={7} kind={kind} />)}
    </QueryClientProvider>,
  );
}

beforeEach(() => apiRequest.mockReset());

describe('MiseEnService — étapes filtrées par kind', () => {
  it('individual : « premier membre » n’est ni montré ni compté', async () => {
    apiRequest.mockResolvedValue({
      data: { complete: false, steps: CLES.map((key) => ({ key, done: key === 'logo' })) },
    });
    monter('individual');

    const carte = await screen.findByTestId('agency-setup-status');
    const lignes = within(carte).getAllByRole('listitem');
    expect(lignes).toHaveLength(6);
    expect(within(carte).queryByText(/membre/i)).toBeNull();
    expect(within(carte).getByRole('progressbar')).toHaveAttribute('aria-valuemax', '6');
  });

  it('individual : tout le reste fait → la carte disparaît, même si « premier membre » ne l’est pas', async () => {
    apiRequest.mockResolvedValue({
      data: { complete: false, steps: CLES.map((key) => ({ key, done: key !== 'first_member' })) },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = monter('individual', client);

    // La réponse est arrivée ET rendue : sans cette attente, l'absence serait vraie avant la requête.
    await vi.waitFor(() =>
      expect(client.getQueryState(['agencies', 7, 'setup-status'])?.status).toBe('success'),
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(container.querySelector('[data-testid="agency-setup-status"]')).toBeNull();
  });

  it('standard : les sept étapes restent', async () => {
    apiRequest.mockResolvedValue({
      data: { complete: false, steps: CLES.map((key) => ({ key, done: false })) },
    });
    monter('standard');

    const carte = await screen.findByTestId('agency-setup-status');
    expect(within(carte).getAllByRole('listitem')).toHaveLength(7);
  });
});
