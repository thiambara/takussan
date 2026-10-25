import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assignAdminAgencySubscription,
  fetchAdminAgencySubscription,
  fetchAdminPlans,
  updateAdminAgencySubscriptionOverrides,
} from '@/lib/queries/super-admin';
import { withIntl } from '@/test/intl';
import type { AgencySubscription } from '@/types/super-admin';

import { AdminAgencySubscriptionPanel } from '../AdminAgencySubscriptionPanel';
import { SubscriptionSummary } from '../SubscriptionSummary';

vi.mock('@/lib/queries/super-admin', () => ({
  fetchAdminAgencySubscription: vi.fn(),
  fetchAdminPlans: vi.fn(),
  assignAdminAgencySubscription: vi.fn(),
  cancelAdminAgencySubscription: vi.fn(),
  updateAdminAgencySubscriptionOverrides: vi.fn(),
}));

const toastAdd = vi.fn();
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: toastAdd }) }));

const abonnement: AgencySubscription = {
  id: 11,
  agency_id: 3,
  plan_id: 2,
  status: 'trialing',
  trial_ends_at: '2026-11-03T10:00:00+00:00',
  current_period_start: '2026-10-21T10:00:00+00:00',
  current_period_end: '2026-11-20T10:00:00+00:00',
  ended_at: null,
  platform_fee_pct_override: 1,
  limits_override: { max_agents: 20 },
  effective_platform_fee_pct: 1,
  effective_limits: { max_agents: 20, max_active_listings: 50, max_branches: 2 },
  plan: undefined,
  created_at: null,
  updated_at: null,
};

function rendre() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={queryClient}>
      <AdminAgencySubscriptionPanel agencyId={3} />
    </QueryClientProvider>,
  ));
}

/**
 * TCK-2222 (P214.01, décision du porteur du 2026-10-24) — « Modifier les dérogations » est un
 * geste séparé de « Changer de plan » : ses champs partent de l'abonnement en cours, et il envoie
 * les quatre dérogations (vide → `null`, la valeur du plan revient) à la route qui modifie sur
 * place, sans clore l'abonnement. Le résumé montre les dérogations actives.
 */
describe('AdminAgencySubscriptionPanel — modifier les dérogations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAdminAgencySubscription).mockResolvedValue({ data: abonnement });
    vi.mocked(fetchAdminPlans).mockResolvedValue({ data: [] } as unknown as Awaited<ReturnType<typeof fetchAdminPlans>>);
    vi.mocked(updateAdminAgencySubscriptionOverrides).mockResolvedValue({ data: abonnement });
  });

  it('pré-remplit les champs depuis l’abonnement et envoie les quatre dérogations sans réassigner', async () => {
    const user = userEvent.setup();
    rendre();

    const carte = await screen.findByRole('region', { name: 'Modifier les dérogations' });
    expect(within(carte).getByLabelText('Commission dérogée (%)')).toHaveValue(1);
    expect(within(carte).getByLabelText('Quota d’agents dérogé')).toHaveValue(20);
    expect(within(carte).getByLabelText('Quota de biens actifs dérogé')).toHaveValue(null);

    await user.type(within(carte).getByLabelText('Quota de biens actifs dérogé'), '150');
    await user.click(within(carte).getByRole('button', { name: 'Enregistrer les dérogations' }));

    await waitFor(() => expect(updateAdminAgencySubscriptionOverrides).toHaveBeenCalledWith(3, {
      platform_fee_pct: 1,
      limits: { max_active_listings: 150, max_agents: 20, max_branches: null },
    }));
    expect(assignAdminAgencySubscription).not.toHaveBeenCalled();
    await waitFor(() => expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: 'Dérogations enregistrées', type: 'success' })));
  });

  it('un champ vidé retire la dérogation', async () => {
    const user = userEvent.setup();
    rendre();

    const carte = await screen.findByRole('region', { name: 'Modifier les dérogations' });
    await user.clear(within(carte).getByLabelText('Commission dérogée (%)'));
    await user.click(within(carte).getByRole('button', { name: 'Enregistrer les dérogations' }));

    await waitFor(() => expect(updateAdminAgencySubscriptionOverrides).toHaveBeenCalledWith(3, {
      platform_fee_pct: null,
      limits: { max_active_listings: null, max_agents: 20, max_branches: null },
    }));
  });

  it('sans abonnement ouvert, le geste n’est pas offert', async () => {
    vi.mocked(fetchAdminAgencySubscription).mockResolvedValue({ data: null });
    rendre();

    expect(await screen.findByText('Changer de plan')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Modifier les dérogations' })).toBeNull();
  });
});

describe('SubscriptionSummary — dérogations actives', () => {
  it('liste les dérogations quand on le lui demande', () => {
    render(withIntl(<SubscriptionSummary subscription={abonnement} showOverrides />));

    const liste = screen.getByRole('list', { name: 'Dérogations actives' });
    expect(within(liste).getByText('Commission plateforme : 1%')).toBeInTheDocument();
    expect(within(liste).getByText('Agents : 20')).toBeInTheDocument();
    expect(within(liste).getAllByRole('listitem')).toHaveLength(2);
  });

  it('dit qu’aucune dérogation ne s’applique', () => {
    render(withIntl(
      <SubscriptionSummary subscription={{ ...abonnement, platform_fee_pct_override: null, limits_override: {} }} showOverrides />,
    ));

    expect(screen.getByText('Aucune dérogation : les valeurs du plan s’appliquent.')).toBeInTheDocument();
  });

  it('ne montre rien des dérogations par défaut (écran de facturation de l’agence)', () => {
    render(withIntl(<SubscriptionSummary subscription={abonnement} />));

    expect(screen.queryByText('Dérogations actives')).toBeNull();
  });
});
