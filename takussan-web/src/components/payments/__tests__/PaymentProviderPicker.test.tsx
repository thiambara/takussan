/**
 * TCK-593 (passe 2, N2) — un checkout vit déjà à un autre montant : l'API rend 409 avec ce checkout,
 * et le sélecteur dit lequel et jusqu'à quand, au lieu d'un refus nu.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import { ApiError } from '@/lib/api';
import { PaymentProviderPicker } from '../PaymentProviderPicker';

let refus: ApiError | null = null;
vi.mock('@/hooks/useInitiatePayment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useInitiatePayment')>()),
  useInitiatePayment: () => ({
    mutateAsync: () => (refus ? Promise.reject(refus) : Promise.resolve({ data: {} })),
    isPending: false,
  }),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));

const texte = (s: string | null | undefined) => (s ?? '').replace(/[\u00a0\u202f]/g, " ");

function rendre() {
  render(
    withIntl(
      <PaymentProviderPicker open onOpenChange={() => {}} paymentType="lease-payments" paymentId={12} currency="XOF" />,
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: new RegExp(fr.payments.gateway.picker.providers.wave) }));
  fireEvent.click(screen.getByRole('button', { name: fr.payments.gateway.picker.confirm }));
}

beforeEach(() => {
  refus = null;
});

function refuser(erreur: ApiError) {
  refus = erreur;
}

describe('PaymentProviderPicker — checkout déjà en cours (N2)', () => {
  it('dit le montant du checkout en cours et l’heure où réessayer', async () => {
    refuser(
      new ApiError(409, {
        message: 'Un paiement en ligne est en cours sur cette échéance : réessayez dans quelques minutes.',
        code: 'checkout_in_progress',
        checkout: { amount: 150000, currency: 'XOF', provider: 'wave', retry_after: '2026-10-07T10:30:00+00:00' },
      }),
    );
    rendre();

    const alerte = texte((await screen.findByRole('alert')).textContent);
    expect(alerte).toContain('Un paiement en ligne de 150 000 F CFA est déjà en cours');
    expect(alerte).toContain('réessayez après 10:30');
  });

  it('un autre refus garde son message', async () => {
    refuser(new ApiError(409, { message: 'Ce paiement n’est plus payable en ligne.' }));
    rendre();

    expect(texte((await screen.findByRole('alert')).textContent)).toBe('Ce paiement n’est plus payable en ligne.');
  });
});
