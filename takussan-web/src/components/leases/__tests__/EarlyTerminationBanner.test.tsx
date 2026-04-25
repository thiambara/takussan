import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toast } from '@base-ui/react/toast';

import { EarlyTerminationBanner } from '../EarlyTerminationBanner';
import frMessages from '@/messages/fr.json';
import type { Lease } from '@/types/lease';

vi.mock('@/lib/queries/leases', () => ({
  useCancelEarlyTermination: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function makeLease(overrides: Partial<Lease> = {}): Lease {
  return {
    id: 1,
    property_id: 10,
    landlord_id: 20,
    tenant_id: 30,
    agency_id: null,
    booking_id: null,
    renewed_from_lease_id: null,
    reference_number: 'LS-TERM',
    type: 'residential_rent',
    status: 'terminating',
    start_date: '2026-01-01',
    end_date: '2027-01-01',
    renewal_date: null,
    monthly_rent: 400_000,
    sale_price: null,
    currency: 'XOF',
    deposit_amount: 800_000,
    deposit_refunded_amount: null,
    deposit_refunded_at: null,
    deposit_refund_reason: null,
    commission_amount: null,
    commission_rate: null,
    payment_frequency: 'monthly',
    payment_day: 5,
    terms: null,
    special_conditions: null,
    guarantor_id: null,
    signed_at: '2026-01-01T00:00:00Z',
    terminated_at: null,
    termination_reason: null,
    early_termination_requested_at: '2026-04-25T10:00:00Z',
    early_termination_requested_by: 20,
    early_termination_effective_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
      .toISOString()
      .slice(0, 10),
    early_termination_penalty_amount: 800_000,
    early_termination_reason: 'Job relocation',
    early_termination_invoice_id: 42,
    notice_period_days: 30,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-04-25T10:00:00Z',
    ...overrides,
  };
}

function withProviders(node: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="fr" messages={frMessages}>
        <Toast.Provider>{node}</Toast.Provider>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

describe('<EarlyTerminationBanner>', () => {
  it('renders nothing when lease is not terminating', () => {
    const { container } = render(
      withProviders(<EarlyTerminationBanner lease={makeLease({ status: 'active' })} />),
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows countdown, penalty amount, invoice link and reason', () => {
    render(withProviders(<EarlyTerminationBanner lease={makeLease()} />));
    const banner = screen.getByTestId('early-termination-banner');

    expect(banner).toHaveTextContent(/Fin dans/i);
    expect(banner).toHaveTextContent(/Pénalité/i);
    // Invoice link
    expect(banner.querySelector('a[href*="invoice=42"]')).not.toBeNull();
    expect(banner).toHaveTextContent(/Job relocation/);
  });

  it('hides the cancel button when canCancel=false', () => {
    render(withProviders(<EarlyTerminationBanner lease={makeLease()} canCancel={false} />));
    expect(
      screen.queryByRole('button', { name: /Annuler la résiliation/i }),
    ).not.toBeInTheDocument();
  });
});
