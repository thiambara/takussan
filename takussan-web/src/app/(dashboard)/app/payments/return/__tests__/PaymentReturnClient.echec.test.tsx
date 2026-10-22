import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { PaymentReturnClient } from '../PaymentReturnClient';

/**
 * TCK-1291 (P131.01) — l'adresse d'annulation que le sélecteur envoie désormais à Wave et à Orange
 * Money (`?status=failed&payment_type=…&payment_id=…`) mène au verdict « Paiement échoué », pas à
 * « Lien de retour incorrect ».
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('status=failed&payment_type=lease-payments&payment_id=12'),
}));
vi.mock('@/hooks/useInitiatePayment', () => ({
  useVerifyPayment: () => ({ data: { data: { status: 'pending' } }, refetch: vi.fn() }),
}));

describe('PaymentReturnClient — retour d’un paiement annulé', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rend « Paiement échoué » quand l’échéance reste due', async () => {
    render(withIntl(<PaymentReturnClient />));
    await act(async () => {
      vi.advanceTimersByTime(900);
    });

    expect(screen.getByText('Paiement échoué')).toBeInTheDocument();
    expect(screen.queryByText('Lien de retour incorrect.')).toBeNull();
  });
});
