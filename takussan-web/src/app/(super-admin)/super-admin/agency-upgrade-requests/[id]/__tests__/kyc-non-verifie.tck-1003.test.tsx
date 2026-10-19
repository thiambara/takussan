import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchAdminAgencyUpgradeRequest,
  type AdminAgencyUpgradeRequestDetail,
} from '@/lib/queries/super-admin';
import { withIntl } from '@/test/intl';
import AgencyUpgradeRequestDetailPage from '../page';

vi.mock('next/navigation', () => ({ useParams: () => ({ id: '7' }) }));

vi.mock('@/lib/queries/super-admin', () => ({ fetchAdminAgencyUpgradeRequest: vi.fn() }));

function detail(kycStatus: string | null): AdminAgencyUpgradeRequestDetail {
  return {
    id: 7,
    agency_id: 3,
    submitted_by: 9,
    rc: 'SN-DKR-2026-B-1',
    ninea: '005012345',
    rib_pro: 'SN012 01001 000123456789 12',
    company_legal_name: 'Awa Immo SARL',
    address_fiscale: 'Dakar',
    planned_agents_count: 2,
    status: 'pending',
    submitted_at: '2026-10-19T10:00:00Z',
    reviewed_by: null,
    reviewed_at: null,
    review_comment: null,
    created_at: '2026-10-19T10:00:00Z',
    updated_at: '2026-10-19T10:00:00Z',
    agency: {
      id: 3,
      name: 'Espace de Awa',
      slug: 'espace-de-awa',
      kind: 'individual',
      status: 'active',
      kyc_status: kycStatus,
      created_at: '2026-09-01T10:00:00Z',
    },
    reviewer: null,
    documents: [],
    counts: { properties: 0, other_requests: 0 },
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={queryClient}>
      <AgencyUpgradeRequestDetailPage />
    </QueryClientProvider>,
  ));
}

/**
 * TCK-1003 (P49.02) — l'API refuse l'approbation d'une demande de passage tant que le dossier KYC
 * de l'agence n'est pas vérifié. La revue le dit avant le geste, et n'offre pas un bouton voué au
 * refus.
 */
describe('/super-admin/agency-upgrade-requests/[id] — dossier KYC non vérifié', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([[null], ['submitted']])('kyc_status=%s : avertit et désactive « Approuver »', async (statut) => {
    vi.mocked(fetchAdminAgencyUpgradeRequest).mockResolvedValue(detail(statut));
    renderPage();

    expect(await screen.findByTestId('upgrade-kyc-not-verified')).toHaveTextContent(
      "Le dossier KYC de l'agence n'est pas vérifié",
    );
    expect(screen.getByRole('link', { name: "Ouvrir l'agence et son dossier KYC" })).toHaveAttribute(
      'href',
      '/super-admin/agencies/3',
    );
    expect(screen.getByRole('button', { name: 'Approuver' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Rejeter' })).toBeEnabled();
  });

  it('kyc_status=verified : ni avertissement, « Approuver » actif', async () => {
    vi.mocked(fetchAdminAgencyUpgradeRequest).mockResolvedValue(detail('verified'));
    renderPage();

    expect(await screen.findByRole('button', { name: 'Approuver' })).toBeEnabled();
    expect(screen.queryByTestId('upgrade-kyc-not-verified')).not.toBeInTheDocument();
  });
});
