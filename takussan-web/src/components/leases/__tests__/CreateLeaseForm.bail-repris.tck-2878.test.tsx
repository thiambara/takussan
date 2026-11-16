import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';

/**
 * TCK-2878 (ADR-0102 § 3, TCK-2894) — le formulaire complet du bail tiré d'une CANDIDATURE reprend
 * le loyer qu'elle propose (300 000 F, le prix du bien à sa création — le bien est passé depuis à
 * 320 000 F), sa caution (450 000 F, pas les 2 mois du bien × le loyer) et la fin de son terme
 * (12 mois, veille comprise). Les défauts du bien, servis, ne les écrasent pas.
 */
const { BIENS, AUTH, ROUTEUR, MUTATION, RESERVATION, DEFAUTS } = vi.hoisted(() => ({
  BIENS: { data: [{ id: 2, title: 'Appartement Ouakam', user_id: 7, owner: { id: 7, name: 'Bineta Sarr' } }] },
  AUTH: { user: { id: 4, full_name: 'Moussa Fall' } },
  ROUTEUR: { push: () => {}, back: () => {} },
  MUTATION: { mutateAsync: vi.fn(async (_valeurs: unknown) => ({ data: { id: 1 } })) },
  RESERVATION: {
    data: {
      data: {
        id: 7,
        kind: 'application',
        property_id: 2,
        customer_id: 21,
        status: 'confirmed',
        reference_number: 'BK-7',
        total_amount: 300_000,
        security_deposit_amount: 450_000,
        security_deposit_months: null,
        term_months: 12,
        currency: 'XOF',
        start_date: '2099-01-01T00:00:00.000000Z',
        end_date: null,
        property: { id: 2, title: 'Appartement Ouakam', slug: 'ouakam', price: 320_000, currency: 'XOF', contract_type: 'rent' },
        customer: { id: 21, user_id: null, first_name: 'Mouhamed', last_name: 'Ndiaye' },
      },
    },
    isLoading: false,
    isError: false,
  },
  DEFAUTS: {
    data: {
      data: {
        property_id: 2,
        type: 'residential_rent',
        currency: 'XOF',
        property_price: { amount: 320_000, period: 'monthly', contract_type: 'rent' },
        monthly_rent: { value: 320_000, source: 'property' },
        sale_price: null,
        monthly_charges: null,
        deposit_months: { value: 2, source: 'property' },
        deposit_amount: { value: 640_000, source: 'property' },
        advance_months: null,
        agency_fee_months: null,
        entry_cost: null,
        payment_day: { value: 1, source: 'platform' },
        late_fee_percent: { value: 5, source: 'agency' },
        late_fee_grace_days: { value: 5, source: 'agency' },
        early_termination_penalty_months: { value: 3, source: 'platform' },
        rent_review_max_pct: { value: 10, source: 'platform' },
        open_applications: [],
      },
    },
  },
}));

vi.mock('next/navigation', () => ({ useRouter: () => ROUTEUR }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => AUTH }));
vi.mock('@/lib/queries/leases', () => ({
  useCreateLease: () => MUTATION,
  useLeasePropertyOptions: () => ({ data: BIENS, isLoading: false }),
  useLeaseCustomerOptions: () => ({ data: { data: [] }, isLoading: false }),
  useLeaseDefaults: () => DEFAUTS,
  useLeaseCustomer: () => ({ data: undefined }),
  useDemanderLaSignature: () => ({ mutateAsync: async () => ({ data: {} }) }),
}));
vi.mock('@/lib/queries/bookings', () => ({ useBooking: () => RESERVATION }));

import { CreateLeaseForm } from '../CreateLeaseForm';

describe('CreateLeaseForm — le bail repris d’une candidature (TCK-2878)', () => {
  it('envoie le loyer, la caution et la fin du terme de la candidature, pas ceux du bien', async () => {
    const user = userEvent.setup();
    render(withIntl(<CreateLeaseForm bookingId={7} />));

    await user.click(screen.getByRole('button', { name: 'Créer le brouillon' }));

    await waitFor(() => expect(MUTATION.mutateAsync).toHaveBeenCalledTimes(1));
    expect(MUTATION.mutateAsync.mock.calls[0]![0]).toMatchObject({
      booking_id: 7,
      tenant_id: 21,
      start_date: '2099-01-01',
      end_date: '2099-12-31',
      monthly_rent: 300_000,
      deposit_amount: 450_000,
    });
  });
});
