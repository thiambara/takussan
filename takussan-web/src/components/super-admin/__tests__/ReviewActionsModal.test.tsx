import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@/components/ui/toast';
import { withIntl } from '@/test/intl';
import {
  approveAdminAgencyUpgradeRequest,
  rejectAdminAgencyUpgradeRequest,
} from '@/lib/queries/super-admin';
import { ReviewActionsModal, type ReviewMode } from '../ReviewActionsModal';

vi.mock('@/lib/queries/super-admin', async (orig) => {
  const actual = await orig<typeof import('@/lib/queries/super-admin')>();
  return {
    ...actual,
    approveAdminAgencyUpgradeRequest: vi.fn(),
    rejectAdminAgencyUpgradeRequest: vi.fn(),
  };
});

const baseDecision = {
  id: 42,
  agency_id: 1,
  submitted_by: 2,
  rc: null,
  ninea: null,
  rib_pro: null,
  company_legal_name: null,
  address_fiscale: null,
  planned_agents_count: null,
  status: 'approved' as const,
  submitted_at: null,
  reviewed_by: null,
  reviewed_at: null,
  review_comment: null,
  created_at: null,
  updated_at: null,
};

function renderModal(mode: ReviewMode, onDecided?: () => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  // `withIntl` charge le VRAI `fr.json` : la modale rend ses libellés via next-intl depuis
  // TCK-292, et un provider à messages vides rendrait la CLÉ au lieu du libellé.
  return render(
    withIntl(
      <ToastProvider>
        <QueryClientProvider client={queryClient}>
          <ReviewActionsModal
            open
            mode={mode}
            requestId={42}
            onOpenChange={() => {}}
            onDecided={onDecided}
          />
        </QueryClientProvider>
      </ToastProvider>,
    ),
  );
}

describe('<ReviewActionsModal>', () => {
  it('approves without a comment when in approve mode', async () => {
    const onDecided = vi.fn();
    vi.mocked(approveAdminAgencyUpgradeRequest).mockResolvedValue(baseDecision);

    renderModal('approve', onDecided);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Confirmer l’approbation/i }));

    await waitFor(() =>
      expect(approveAdminAgencyUpgradeRequest).toHaveBeenCalledWith(42, null),
    );
    await waitFor(() => expect(onDecided).toHaveBeenCalledTimes(1));
  });

  it('keeps the reject submit disabled until the motif is long enough', async () => {
    renderModal('reject');
    const user = userEvent.setup();

    const submit = screen.getByRole('button', { name: /Confirmer le rejet/i });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/Motif du rejet/i), 'no');
    expect(submit).toBeDisabled();
  });

  it('rejects with a non-empty motif and fires onDecided', async () => {
    const onDecided = vi.fn();
    vi.mocked(rejectAdminAgencyUpgradeRequest).mockResolvedValue({
      ...baseDecision,
      status: 'rejected',
      review_comment: 'Documents illisibles — merci de renvoyer un PDF natif.',
    });

    renderModal('reject', onDecided);
    const user = userEvent.setup();

    const motif = 'Documents illisibles — merci de renvoyer un PDF natif.';
    await user.type(screen.getByLabelText(/Motif du rejet/i), motif);
    await user.click(screen.getByRole('button', { name: /Confirmer le rejet/i }));

    await waitFor(() =>
      expect(rejectAdminAgencyUpgradeRequest).toHaveBeenCalledWith(42, motif),
    );
    await waitFor(() => expect(onDecided).toHaveBeenCalledTimes(1));
  });
});
