/**
 * TCK-593 (Partie 1, AC1) — le contrat de bail se télécharge depuis l'ORIGINE DE L'API, avec le
 * jeton de session.
 *
 * Le lien était `<Link href="/api/leases/{id}/contract/pdf">` : relatif, il frappait l'origine Next,
 * qui n'a pas cette route (404), sans `Bearer`. Restaurer ce lien fait rougir ce test — il n'y a
 * alors plus de bouton, et aucun `fetch` ne part.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import { LeaseDetail } from '../LeaseDetail';

vi.mock('@/lib/queries/leases', () => {
  const mutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
  return {
  useLease: () => ({
    data: {
      data: {
        id: 7,
        reference_number: 'BAIL-7',
        status: 'active',
        type: 'residential_rent',
        agency_id: 3,
        start_date: '2026-01-01',
        end_date: null,
        monthly_rent: 150000,
        deposit_amount: 300000,
      },
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useLeasePayments: () => ({ data: { data: [] } }),
  useGenerateSchedule: mutation,
  useActivateLease: mutation,
  useReviewLeaseRent: mutation,
  };
});

// Les sections voisines ne sont pas le sujet : chacune tire ses propres requêtes.
vi.mock('../LeaseSchedule', () => ({ LeaseSchedule: () => null }));
vi.mock('../LeasePaymentDialog', () => ({ LeasePaymentDialog: () => null }));
vi.mock('../GuarantorSection', () => ({ GuarantorSection: () => null }));
vi.mock('../DepositRefundBanner', () => ({ DepositRefundBanner: () => null }));
vi.mock('../LeaseRenewalDialog', () => ({ LeaseRenewalDialog: () => null }));
vi.mock('../LeaseChainTimeline', () => ({ LeaseChainTimeline: () => null }));
vi.mock('../EarlyTerminationDialog', () => ({ EarlyTerminationDialog: () => null }));
vi.mock('../EarlyTerminationBanner', () => ({ EarlyTerminationBanner: () => null }));
vi.mock('@/components/reviews/LeaveReviewCta', () => ({ LeaveReviewCta: () => null }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 9, roles: ['customer'] }, token: 'jeton-locataire' }),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LeaseDetail — contrat PDF (TCK-593 AC1)', () => {
  it('télécharge depuis l’API avec le Bearer, pas par un lien relatif', async () => {
    fetchMock.mockResolvedValue(new Response(new Blob(['%PDF']), { status: 200 }));
    render(withIntl(<LeaseDetail leaseId={7} />));

    expect(screen.queryByRole('link', { name: fr.lease.detail.downloadContract })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: fr.lease.detail.downloadContract }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const origine = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8002').replace(/\/api$/, '');
    expect(url).toBe(`${origine}/api/leases/7/contract/pdf`);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jeton-locataire');
  });

  it('un 403 se lit dans la langue de l’utilisateur', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: 'This action is unauthorized.' }), { status: 403 }),
    );
    render(withIntl(<LeaseDetail leaseId={7} />));
    fireEvent.click(screen.getByRole('button', { name: fr.lease.detail.downloadContract }));

    expect(await screen.findByRole('alert')).toHaveTextContent(fr.documents.download.errors.interdit);
  });
});
