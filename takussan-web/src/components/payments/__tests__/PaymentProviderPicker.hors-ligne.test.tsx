/**
 * TCK-1479 (P113.03) — hors ligne, l'initiation d'un paiement échoue tout de suite.
 *
 * Mesuré le 2026-10-22 : sous `networkMode: 'online'` (le défaut de TanStack), une mutation lancée
 * hors ligne restait suspendue, l'écran affichait « Redirection… », et la mutation partait seule
 * au retour du réseau — redirection chez le fournisseur comprise. Décision du porteur :
 * `networkMode: 'always'` pour les seules mutations de `createQueryClient`.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import { createQueryClient } from '@/lib/query-client';
import { PaymentProviderPicker } from '../PaymentProviderPicker';

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));

describe('PaymentProviderPicker — hors ligne (TCK-1479)', () => {
  let reseau: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    reseau = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', reseau);
    onlineManager.setOnline(false);
  });
  afterEach(() => {
    onlineManager.setOnline(true);
    vi.unstubAllGlobals();
  });

  it('part tout de suite, affiche l’échec, et ne repart pas au retour du réseau', async () => {
    const client = createQueryClient();
    render(
      withIntl(
        <QueryClientProvider client={client}>
          <PaymentProviderPicker
            open
            onOpenChange={() => {}}
            paymentType="lease-payments"
            paymentId={12}
            currency="XOF"
          />
        </QueryClientProvider>,
      ),
    );
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(fr.payments.gateway.picker.providers.wave) }),
    );
    fireEvent.click(screen.getByRole('button', { name: fr.payments.gateway.picker.confirm }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(reseau).toHaveBeenCalledTimes(1);
    expect(client.getMutationCache().getAll().some((m) => m.state.isPaused)).toBe(false);

    onlineManager.setOnline(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(reseau).toHaveBeenCalledTimes(1);
  });

  it('les lectures gardent le mode réseau par défaut', () => {
    const options = createQueryClient().getDefaultOptions();
    expect(options.mutations?.networkMode).toBe('always');
    expect(options.queries?.networkMode).toBeUndefined();
  });
});
