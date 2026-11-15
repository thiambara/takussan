/**
 * TCK-2671 — l'état de la dernière demande, en tête de la page.
 *
 * - Refusée : le motif, et « remplacez la pièce, le reste est conservé ».
 * - En cours : « Révoquer la demande » demande confirmation ; la révocation ne part qu'après.
 * - Les dates suivent la langue de l'écran (elles étaient en `fr-FR` écrit en dur).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import type { AgencyUpgradeRequest } from '@/types/agency-upgrade';

const revoquer = vi.fn();
vi.mock('@/lib/queries/agency-upgrade', () => ({ revokeAgencyUpgradeRequest: (...a: unknown[]) => revoquer(...a) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
const toastAdd = vi.fn();
vi.mock('@/components/ui/toast', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui/toast')>()),
  useToast: () => ({ add: toastAdd }),
}));

import { UpgradeRequestStatus } from '../UpgradeRequestStatus';

const demande = (statut: AgencyUpgradeRequest['status'], extra: Partial<AgencyUpgradeRequest> = {}): AgencyUpgradeRequest => ({
  id: 2,
  agency_id: 4,
  submitted_by: 1,
  rc: null,
  ninea: null,
  rib_pro: null,
  company_legal_name: null,
  address_fiscale: null,
  planned_agents_count: null,
  status: statut,
  submitted_at: '2025-10-28T10:00:00Z',
  reviewed_by: null,
  reviewed_at: statut === 'rejected' ? '2025-11-02T10:00:00Z' : null,
  review_comment: null,
  created_at: null,
  updated_at: null,
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  revoquer.mockResolvedValue({ data: {} });
});

describe('<UpgradeRequestStatus> (TCK-2671)', () => {
  it('refusée : le motif, la consigne, la date de soumission', () => {
    render(withIntl(<UpgradeRequestStatus agencyId={4} request={demande('rejected', { review_comment: 'Statuts illisibles' })} />));
    expect(screen.getByRole('heading', { name: 'Demande refusée' })).toBeInTheDocument();
    expect(screen.getByText('« Statuts illisibles »')).toBeInTheDocument();
    expect(screen.getByText(/remplacez la pièce, puis renvoyez-la : le reste est conservé/)).toBeInTheDocument();
    expect(screen.getByText(/Soumise le 28 oct\. 2025 · décision de l’équipe Takussan/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Révoquer la demande' })).not.toBeInTheDocument();
  });

  it('en cours : la révocation demande confirmation, et « Garder la demande » n’envoie rien', async () => {
    const user = userEvent.setup();
    render(withIntl(<UpgradeRequestStatus agencyId={4} request={demande('pending')} />));
    await user.click(screen.getByRole('button', { name: 'Révoquer la demande' }));
    expect(revoquer).not.toHaveBeenCalled();
    expect(await screen.findByRole('dialog', { name: 'Révoquer votre demande ?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Garder la demande' }));
    expect(revoquer).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Révoquer la demande' }));
    await user.click(await screen.findByRole('button', { name: 'Révoquer' }));
    await waitFor(() => expect(revoquer).toHaveBeenCalledWith('jeton', 4, 2));
    expect(refresh).toHaveBeenCalled();
  });

  it('une révocation qui échoue le dit : la demande reste en cours', async () => {
    revoquer.mockRejectedValue(new TypeError('Failed to fetch'));
    const user = userEvent.setup();
    render(withIntl(<UpgradeRequestStatus agencyId={4} request={demande('pending')} />));
    await user.click(screen.getByRole('button', { name: 'Révoquer la demande' }));
    await user.click(await screen.findByRole('button', { name: 'Révoquer' }));
    await waitFor(() => expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', title: 'La demande n’a pas été révoquée' })));
  });

  it('les dates suivent la langue de l’écran', () => {
    render(withIntl(<UpgradeRequestStatus agencyId={4} request={demande('pending')} />, 'en'));
    expect(screen.getByText(/^Submitted on .*Oct.*2025$/)).toBeInTheDocument();
    expect(screen.queryByText(/oct\./)).not.toBeInTheDocument();
  });
});
