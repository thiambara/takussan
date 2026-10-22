import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { ApiError } from '@/lib/api';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import { approveProperty, rejectProperty, type ModerationProperty } from '@/lib/queries/property-moderation';
import { withIntl } from '@/test/intl';
import { PropertyModerationDetail } from '../PropertyModerationDetail';

/**
 * TCK-1203 — approuver ou refuser un bien exige la 2FA d'un profil plateforme
 * (`PropertyModerationController`, `ProtectedActions::PLATFORM_TWO_FACTOR`) : le refus passe par
 * la garde, puis la décision est rejouée.
 */
vi.mock('@/lib/queries/property-moderation', () => ({ approveProperty: vi.fn(), rejectProperty: vi.fn() }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));

const refus = () => new ApiError(403, { code: 'two_factor_required', message: 'Second facteur requis.' });
const BIEN = {
  id: 42,
  title: 'Villa aux Almadies',
  reference_number: 'T-42',
  agency: null,
  location: null,
  main_photo_url: null,
  owner: null,
  price: 100000,
  currency: 'XOF',
  type: 'villa',
  submitted_at: null,
} as unknown as ModerationProperty;
const MOTIF = 'Les photos ne correspondent pas au bien décrit.';

function monter(garde: GardeDoubleFacteurFn) {
  const onModerated = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={client}>
      <ContexteGardeDoubleFacteur.Provider value={garde}>
        <PropertyModerationDetail property={BIEN} onModerated={onModerated} />
      </ContexteGardeDoubleFacteur.Provider>
    </QueryClientProvider>,
  ));
  return onModerated;
}

describe('<PropertyModerationDetail> — second facteur', () => {
  beforeEach(() => {
    vi.mocked(approveProperty).mockReset();
    vi.mocked(rejectProperty).mockReset();
  });

  it('l’approbation refusée passe par la garde, puis est rejouée', async () => {
    vi.mocked(approveProperty).mockRejectedValueOnce(refus()).mockResolvedValueOnce({} as never);
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => true);
    const onModerated = monter(garde);

    await userEvent.click(screen.getByRole('button', { name: 'Approuver' }));

    await waitFor(() => expect(onModerated).toHaveBeenCalled());
    expect(garde).toHaveBeenCalledWith('two_factor_required');
    expect(approveProperty).toHaveBeenCalledTimes(2);
  });

  it('le rejet refusé passe par la garde, puis est rejoué avec le même motif', async () => {
    vi.mocked(rejectProperty).mockRejectedValueOnce(refus()).mockResolvedValueOnce({} as never);
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => true);
    const onModerated = monter(garde);

    await userEvent.click(screen.getByRole('button', { name: 'Rejeter' }));
    await userEvent.type(screen.getByRole('textbox'), MOTIF);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer le rejet' }));

    await waitFor(() => expect(onModerated).toHaveBeenCalled());
    expect(garde).toHaveBeenCalledWith('two_factor_required');
    expect(rejectProperty).toHaveBeenCalledTimes(2);
    expect(rejectProperty).toHaveBeenLastCalledWith(42, MOTIF, 'jeton');
  });

  it('garde abandonnée : pas de rejeu, l’erreur s’affiche', async () => {
    vi.mocked(approveProperty).mockRejectedValue(refus());
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => false);
    const onModerated = monter(garde);

    await userEvent.click(screen.getByRole('button', { name: 'Approuver' }));

    expect(await screen.findByText('Second facteur requis.')).toBeInTheDocument();
    expect(garde).toHaveBeenCalledTimes(1);
    expect(approveProperty).toHaveBeenCalledTimes(1);
    expect(onModerated).not.toHaveBeenCalled();
  });
});
