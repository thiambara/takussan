/**
 * TCK-594 (ADR-0039 §4) — ce que la plateforme reverse à une agence passe par trois mains.
 *
 * Qui clôture n'approuve pas, qui approuve ne paie pas, et l'argent parti se prouve par la référence
 * du virement. Le serveur le refuse (`segregation.*`, `payment_reference` requis) ; ces tests gardent
 * l'accord entre l'écran et le serveur, pas une sécurité. La clôture dit enfin quelles agences elle
 * a écartées, et pourquoi : sans cela, « aucun paiement éligible » se lit « rien à payer ».
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { PlatformPayout } from '@/types/super-admin';

const API = vi.hoisted(() => ({
  fetchAdminPlatformPayout: vi.fn(),
  approveAdminPlatformPayout: vi.fn(),
  markAdminPlatformPayoutPaid: vi.fn(),
  cancelAdminPlatformPayout: vi.fn(),
  closeAdminPlatformPayoutPeriod: vi.fn(),
}));
vi.mock('@/lib/queries/super-admin', () => API);
const AUTH = vi.hoisted(() => ({ current: { user: { id: 1 } } }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => AUTH.current }));
const TOAST = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => TOAST }));
vi.mock('@/components/admin/super/AgencyCombobox', () => ({ AgencyCombobox: () => null }));

import { PayoutDetailPanel } from '../PayoutDetailPanel';
import { PayoutCloseDialog } from '../PayoutCloseDialog';

const BASE: PlatformPayout = {
  id: 7,
  agency_id: 3,
  period_start: '2026-09-01',
  period_end: '2026-09-30',
  gross_amount: 500000,
  platform_fee_amount: 50000,
  net_amount: 450000,
  currency: 'XOF',
  status: 'pending',
  closed_by_id: 1,
  approved_by: null,
  processed_at: null,
  failure_reason: null,
  metadata: null,
  created_at: null,
  updated_at: null,
};

function avecClient(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

function ouvrir(payout: PlatformPayout) {
  API.fetchAdminPlatformPayout.mockResolvedValue({ data: payout });
  render(withIntl(avecClient(<PayoutDetailPanel payoutId={payout.id} onClose={() => {}} />)));
}

describe('Reversements plateforme — trois mains et une preuve (TCK-594)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    AUTH.current = { user: { id: 1 } };
  });

  it("n'offre pas l'approbation à qui a clôturé, et la laisse à un autre", async () => {
    ouvrir(BASE);
    expect(await screen.findByRole('button', { name: 'Approuver' })).toBeDisabled();
    expect(screen.getByText(/Vous avez clôturé cette période/)).toBeInTheDocument();
  });

  it("l'offre à une autre personne que celle qui a clôturé", async () => {
    AUTH.current = { user: { id: 2 } };
    ouvrir(BASE);
    expect(await screen.findByRole('button', { name: 'Approuver' })).toBeEnabled();
  });

  it("n'offre pas le paiement à qui a approuvé", async () => {
    AUTH.current = { user: { id: 2 } };
    ouvrir({ ...BASE, status: 'approved', approved_by: 2 });
    const reference = await screen.findByRole('textbox', { name: 'Référence du virement' });
    fireEvent.change(reference, { target: { value: 'VIR-2026-0042' } });

    expect(screen.getByRole('button', { name: 'Marquer payé' })).toBeDisabled();
    expect(screen.getByText(/Vous avez approuvé ce reversement/)).toBeInTheDocument();
  });

  it('exige la référence du virement, et l’envoie', async () => {
    AUTH.current = { user: { id: 3 } };
    API.markAdminPlatformPayoutPaid.mockResolvedValue({ data: { ...BASE, status: 'paid' } });
    ouvrir({ ...BASE, status: 'approved', approved_by: 2 });
    const bouton = await screen.findByRole('button', { name: 'Marquer payé' });
    expect(bouton).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox', { name: 'Référence du virement' }), { target: { value: ' VIR-2026-0042 ' } });
    fireEvent.click(bouton);

    await waitFor(() => expect(API.markAdminPlatformPayoutPaid).toHaveBeenCalledTimes(1));
    expect(API.markAdminPlatformPayoutPaid.mock.calls[0][1]).toMatchObject({ payment_reference: 'VIR-2026-0042' });
  });

  it('nomme les agences écartées de la clôture, avec leur motif', async () => {
    API.closeAdminPlatformPayoutPeriod.mockResolvedValue({
      data: [],
      excluded: [
        { agency_id: 4, reason: 'agency_not_active' },
        { agency_id: 9, reason: 'already_closed' },
      ],
    });
    render(withIntl(avecClient(<PayoutCloseDialog />)));

    fireEvent.click(screen.getByRole('button', { name: 'Clôturer' }));

    expect(await screen.findByText('Agence #4 — agence suspendue ou non active')).toBeInTheDocument();
    expect(screen.getByText('Agence #9 — période déjà clôturée')).toBeInTheDocument();
    expect(screen.getByText(/2 agences écartées/)).toBeInTheDocument();
  });
});
