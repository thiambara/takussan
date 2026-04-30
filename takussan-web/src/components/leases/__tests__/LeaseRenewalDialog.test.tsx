import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { LeaseRenewalDialog } from '../LeaseRenewalDialog';
import frMessages from '@/messages/fr.json';
import type { Lease } from '@/types/lease';

vi.mock('@/lib/queries/leases', () => ({
  useRenewLease: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ data: { id: 999 } }),
    isPending: false,
  }),
}));

const parent: Lease = {
  id: 1,
  property_id: 10,
  landlord_id: 20,
  tenant_id: 30,
  agency_id: null,
  booking_id: null,
  renewed_from_lease_id: null,
  reference_number: 'LS-AAAAAAAA',
  type: 'residential_rent',
  status: 'active',
  start_date: '2025-01-01',
  end_date: '2025-12-31',
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
  terms: 'Original terms',
  special_conditions: null,
  guarantor_id: null,
  signed_at: '2025-01-01T00:00:00Z',
  terminated_at: null,
  termination_reason: null,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

function withProviders(node: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="fr" messages={frMessages}>
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

describe('<LeaseRenewalDialog>', () => {
  it('renders the wizard at step 1 with start_date defaulting to parent.end_date+1', () => {
    render(withProviders(<LeaseRenewalDialog open onOpenChange={() => {}} parent={parent} />));

    const startInput = document.getElementById('renew-start') as HTMLInputElement;
    // parent.end_date = 2025-12-31 → +1 day → 2026-01-01
    expect(startInput.value).toBe('2026-01-01');
  });

  it('advances steps via Suivant and renders the diff summary at step 3', () => {
    render(withProviders(<LeaseRenewalDialog open onOpenChange={() => {}} parent={parent} />));

    // Step 1 → 2
    fireEvent.click(screen.getByRole('button', { name: /Suivant/i }));
    const rentInput = document.getElementById('renew-rent') as HTMLInputElement;
    expect(rentInput).toBeInTheDocument();
    expect(rentInput.value).toBe('400000');

    // Modify the rent so the diff highlight appears in summary
    fireEvent.change(rentInput, { target: { value: '450000' } });

    // Step 2 → 3
    fireEvent.click(screen.getByRole('button', { name: /Suivant/i }));
    // Summary surfaces the new rent value as the "to" side of a diff row.
    expect(screen.getByText('450000')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirmer/i })).toBeInTheDocument();
  });

  it('exposes the tenant_immutable hint on step 1', () => {
    render(withProviders(<LeaseRenewalDialog open onOpenChange={() => {}} parent={parent} />));
    expect(
      screen.getByText(/Le locataire et le bien ne peuvent pas être modifiés/i),
    ).toBeInTheDocument();
  });
});
