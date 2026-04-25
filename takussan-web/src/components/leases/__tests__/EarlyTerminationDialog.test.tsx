import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { EarlyTerminationDialog } from '../EarlyTerminationDialog';
import frMessages from '@/messages/fr.json';
import type { Lease } from '@/types/lease';

const mutateAsync = vi.fn().mockResolvedValue({ data: { id: 1 } });

vi.mock('@/lib/queries/leases', () => ({
  useRequestEarlyTermination: () => ({ mutateAsync, isPending: false }),
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
    reference_number: 'LS-EARLY',
    type: 'residential_rent',
    status: 'active',
    start_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 180).toISOString().slice(0, 10),
    end_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 180).toISOString().slice(0, 10),
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
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
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
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

describe('<EarlyTerminationDialog>', () => {
  it('defaults effective_date to today + notice_period_days (30)', () => {
    render(withProviders(<EarlyTerminationDialog open onOpenChange={() => {}} lease={makeLease()} />));

    const input = document.getElementById('et-effective') as HTMLInputElement;
    const expected = new Date();
    expected.setDate(expected.getDate() + 30);
    expect(input.value).toBe(expected.toISOString().slice(0, 10));
  });

  it('shows live penalty estimate (2 months x rent)', () => {
    render(withProviders(<EarlyTerminationDialog open onOpenChange={() => {}} lease={makeLease()} />));

    const estimate = screen.getByTestId('penalty-estimate');
    expect(estimate).toHaveTextContent('2 mois');
    // 2 x 400000 = 800000. Number.toLocaleString() follows the jsdom
    // runtime locale (en-US in CI), so accept either '800,000' or '800 000'.
    expect(estimate.textContent ?? '').toMatch(/800[\s,]?000/);
  });

  it('disables submit when effective_date is below the notice minimum', () => {
    render(withProviders(<EarlyTerminationDialog open onOpenChange={() => {}} lease={makeLease()} />));

    const input = document.getElementById('et-effective') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2020-01-01' } });

    const submit = screen.getByRole('button', { name: /Confirmer la résiliation/i });
    expect(submit).toBeDisabled();
  });

  it('submits the request with the date and reason payload', async () => {
    mutateAsync.mockClear();
    render(withProviders(<EarlyTerminationDialog open onOpenChange={() => {}} lease={makeLease()} />));

    const reason = document.getElementById('et-reason') as HTMLTextAreaElement;
    fireEvent.change(reason, { target: { value: 'Tenant relocation' } });

    fireEvent.click(screen.getByRole('button', { name: /Confirmer la résiliation/i }));

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({
      reason: 'Tenant relocation',
    });
    expect(mutateAsync.mock.calls[0][0].effective_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
