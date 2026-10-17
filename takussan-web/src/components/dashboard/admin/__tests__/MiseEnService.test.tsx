import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { ApiError } from '@/lib/api';
import { MiseEnService } from '../MiseEnService';

/** TCK-589 — la carte « Mise en service » du tableau de bord d'agence, alimentée par `setup-status`. */
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

function monter() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {withIntl(<MiseEnService agencyId={7} />)}
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiRequest.mockReset();
});

describe('MiseEnService', () => {
  /** TCK-761 (P15.04) — la 2FA conditionne trois étapes : elle passe en tête, le reste garde l'ordre de l'API. */
  it('place le second facteur en tête, et les autres étapes dans l’ordre de l’API', async () => {
    apiRequest.mockResolvedValue({
      data: { complete: false, steps: CLES.map((key) => ({ key, done: false })) },
    });
    monter();

    const carte = await screen.findByTestId('agency-setup-status');
    const lignes = within(carte).getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(lignes[0]).toMatch(/Double authentification de l’administrateur/);
    expect(lignes[1]).toMatch(/Dossier KYC vérifié/);
    expect(lignes).toHaveLength(7);
  });

  it('une ligne par étape : cochée si faite, sinon un lien direct ; la progression', async () => {
    apiRequest.mockResolvedValue({
      data: {
        complete: false,
        steps: CLES.map((key) => ({ key, done: key === 'logo' || key === 'commission_rate' })),
      },
    });
    monter();

    const carte = await screen.findByTestId('agency-setup-status');
    expect(apiRequest).toHaveBeenCalledWith('/api/agencies/7/setup-status', expect.anything());
    expect(within(carte).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
    expect(within(carte).getByText('2 sur 7 étapes terminées')).toBeInTheDocument();
    expect(within(carte).getByRole('link', { name: /Dossier KYC vérifié/ })).toHaveAttribute('href', '/app/agency/kyc');
    expect(within(carte).getByRole('link', { name: /Premier bien publié/ })).toHaveAttribute('href', '/app/properties/new');
    // Une étape faite n'est plus un lien.
    expect(within(carte).queryByRole('link', { name: /Logo de l’agence ajouté/ })).toBeNull();
    expect(within(carte).getByText('Logo de l’agence ajouté')).toBeInTheDocument();
    expect(within(carte).getAllByRole('listitem')).toHaveLength(7);
  });

  it('agence prête : rien', async () => {
    apiRequest.mockResolvedValue({ data: { complete: true, steps: CLES.map((key) => ({ key, done: true })) } });
    const { container } = monter();
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('refus (agent → 403) : rien, la carte ne bloque pas l’écran', async () => {
    apiRequest.mockRejectedValue(new ApiError(403, { message: 'Forbidden' }));
    const { container } = monter();
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('aucune étape inventée : une clé inconnue ne s’affiche pas, mais compte', async () => {
    apiRequest.mockResolvedValue({
      data: { complete: false, steps: [{ key: 'logo', done: false }, { key: 'etape_future', done: true }] },
    });
    monter();
    const carte = await screen.findByTestId('agency-setup-status');
    expect(within(carte).getAllByRole('listitem')).toHaveLength(1);
    expect(within(carte).getByText('1 sur 2 étapes terminées')).toBeInTheDocument();
    expect(carte.textContent).not.toContain('etape_future');
  });
});
