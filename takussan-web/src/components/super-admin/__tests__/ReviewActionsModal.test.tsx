import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@/components/ui/toast';
import { ApiError } from '@/lib/api';
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
  /**
   * TCK-2730 — l'API refuse l'approbation tant que l'abonnement ouvert porte des dérogations : la
   * modale montre sa prose ET les dérogations, nommées comme dans le panneau où on les retire.
   */
  it("montre les dérogations qui bloquent l'approbation", async () => {
    const prose = "L'abonnement en cours de cette agence porte des dérogations (commission ou quotas) : retirez-les avant d'approuver son passage en agence professionnelle.";
    vi.mocked(approveAdminAgencyUpgradeRequest).mockRejectedValue(
      new ApiError(409, {
        code: 'agency_upgrade.subscription_has_overrides',
        message: prose,
        overrides: { platform_fee_pct: 3, limits: { max_active_listings: 50 } },
      }),
    );
    const onDecided = vi.fn();
    renderModal('approve', onDecided);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Confirmer l’approbation/i }));

    expect(await screen.findByText(prose)).toBeInTheDocument();
    const liste = screen.getByRole('list', { name: 'Modifier les dérogations' });
    const lignes = Array.from(liste.querySelectorAll('li')).map((li) => li.textContent);
    expect(lignes).toEqual(['Commission dérogée (%)3', 'Quota de biens actifs dérogé50']);
    expect(onDecided).not.toHaveBeenCalled();
  });

  /**
   * Vérification adverse de TCK-2730 — fermée puis rouverte, la modale ne montre plus les
   * dérogations de la tentative précédente (le composant reste monté entre deux ouvertures).
   */
  it('fermée puis rouverte, la liste des dérogations est vidée', async () => {
    vi.mocked(approveAdminAgencyUpgradeRequest).mockRejectedValue(
      new ApiError(409, {
        code: 'agency_upgrade.subscription_has_overrides',
        message: 'Dérogations en cours.',
        overrides: { platform_fee_pct: 3 },
      }),
    );
    function Hote() {
      const [ouverte, setOuverte] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setOuverte(true)}>
            Rouvrir
          </button>
          <ReviewActionsModal open={ouverte} mode="approve" requestId={42} onOpenChange={setOuverte} />
        </>
      );
    }
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      withIntl(
        <ToastProvider>
          <QueryClientProvider client={queryClient}>
            <Hote />
          </QueryClientProvider>
        </ToastProvider>,
      ),
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Confirmer l’approbation/i }));
    expect(await screen.findByRole('list', { name: 'Modifier les dérogations' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Modifier les dérogations' })).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Rouvrir' }));

    expect(await screen.findByRole('button', { name: /Confirmer l’approbation/i })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Modifier les dérogations' })).toBeNull();
  });

  it("une autre erreur ne montre pas de liste de dérogations", async () => {
    vi.mocked(approveAdminAgencyUpgradeRequest).mockRejectedValue(
      new ApiError(422, { code: 'agency.suspended', message: "Cette agence est suspendue." }),
    );
    renderModal('approve');
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Confirmer l’approbation/i }));

    expect(await screen.findByText('Cette agence est suspendue.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Modifier les dérogations' })).toBeNull();
  });
});
