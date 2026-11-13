import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { PaymentReturnClient } from '../PaymentReturnClient';

/**
 * TCK-596 (VERIF-596 passe 8, m-o) — le locataire débité sur une échéance annulée par un
 * renouvellement voyait « Paiement échoué… Vous pouvez réessayer » : l'écran l'invitait à payer une
 * seconde fois. Quand l'API dit `refund_pending`, la page dit que l'agence rembourse.
 */
const etat = vi.hoisted(() => ({
  data: null as null | { data: { status: string | null; provider_status?: string; refund_pending?: boolean } },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('payment_type=lease-payments&payment_id=12&status=success'),
}));
vi.mock('@/hooks/useInitiatePayment', () => ({
  useVerifyPayment: () => ({ data: etat.data, error: null, refetch: vi.fn() }),
}));
vi.mock('@/lib/queries/payments', () => ({
  useResumeDuLoyer: () => ({ data: { data: { lease: { agency: { id: 1, name: 'Dakar Immo', phone: '+221338212100' } }, offline_payment: null } } }),
}));

async function rendre() {
  render(withIntl(<PaymentReturnClient />));
  // Le chargement minimal de 800 ms passé, la page montre son verdict.
  await act(async () => {
    vi.advanceTimersByTime(900);
  });
}

describe('PaymentReturnClient — règlement à rembourser', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('échéance annulée pendant le paiement : « l’agence vous remboursera », pas un échec', async () => {
    etat.data = { data: { status: 'cancelled', provider_status: 'success', refund_pending: true } };
    await rendre();

    expect(screen.getByRole('heading', { name: 'Cette échéance a été annulée : nous vous remboursons' })).toBeInTheDocument();
    expect(screen.getByText('Votre paiement est arrivé sur une échéance annulée. L’agence vous le rendra.')).toBeInTheDocument();
    expect(screen.queryByText('Paiement non abouti')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Contacter l’agence' })).toHaveAttribute('href', 'tel:+221338212100');
    expect(screen.getByRole('link', { name: 'Retour aux paiements' })).toHaveAttribute('href', '/app/payments');
  });

  it('échéance déjà réglée : le paiement en double est remboursé, pas « confirmé »', async () => {
    etat.data = { data: { status: 'paid', provider_status: 'success', refund_pending: true } };
    await rendre();

    expect(screen.getByRole('heading', { name: 'Ce loyer était déjà réglé : nous vous remboursons' })).toBeInTheDocument();
    expect(screen.queryByText('Paiement confirmé')).toBeNull();
  });

  it('sans drapeau, une échéance annulée reste un échec', async () => {
    etat.data = { data: { status: 'cancelled', provider_status: 'failed', refund_pending: false } };
    await rendre();
    expect(screen.getByRole('heading', { name: 'Paiement non abouti' })).toBeInTheDocument();
  });
});
