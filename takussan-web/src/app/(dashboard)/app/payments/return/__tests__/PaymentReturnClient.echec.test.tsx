import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { PaymentReturnClient } from '../PaymentReturnClient';

/**
 * TCK-1291 (P131.01) — l'adresse d'annulation que le sélecteur envoie désormais à Wave et à Orange
 * Money (`?status=failed&payment_type=…&payment_id=…`) mène au verdict « non abouti », pas au lien
 * invalide. TCK-2650 : l'indice n'en fait pas une issue définitive — l'interrogation continue.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('status=failed&payment_type=lease-payments&payment_id=12'),
}));
vi.mock('@/hooks/useInitiatePayment', () => ({
  useVerifyPayment: () => ({ data: { data: { status: 'pending' } }, error: null, refetch: vi.fn() }),
}));
vi.mock('@/lib/queries/payments', () => ({ useResumeDuLoyer: () => ({ data: undefined }) }));

describe('PaymentReturnClient — retour d’un paiement annulé', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rend « Paiement non abouti » quand l’échéance reste due', async () => {
    render(withIntl(<PaymentReturnClient />));
    await act(async () => {
      vi.advanceTimersByTime(900);
    });

    expect(screen.getByRole('heading', { name: 'Paiement non abouti' })).toBeInTheDocument();
    expect(screen.getByText('Aucun montant n’a été débité.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Payer à l’agence' })).toHaveAttribute('href', '/app/payments?moyen=agence');
    expect(screen.queryByText('Ce lien de retour ne correspond à aucun paiement')).toBeNull();
  });
});
