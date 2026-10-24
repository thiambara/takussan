/**
 * P212.05 — les deux défauts du renouvellement se calculent en jours calendaires : début =
 * fin du parent + 1 (celui de `LeaseRenewalService`), fin = début + 1 an. Calculés en heure
 * locale puis relus en UTC, ils perdaient un jour aux changements d'heure. Navigateur à Paris,
 * fixé AVANT toute date.
 */
process.env.TZ = 'Europe/Paris';

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
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

// The renewal wizard now uses our shadcn `<DatePicker>` (button + popover).
// For these state-level tests we shim it into a native date input so the
// existing assertions (`getElementById('renew-start').value`, fireEvent
// change) keep their intent without depending on the popover internals.
vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({
    id,
    value,
    onValueChange,
    min,
  }: {
    id?: string;
    value?: string;
    onValueChange: (v: string) => void;
    min?: string;
  }) => (
    <input
      id={id}
      type="date"
      data-min={min}
      value={value ?? ''}
      onChange={(e) => onValueChange(e.target.value)}
    />
  ),
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

function defauts(end_date: string): { debut: string; fin: string } {
  render(withProviders(<LeaseRenewalDialog open onOpenChange={() => {}} parent={{ ...parent, end_date }} />));
  return {
    debut: (document.getElementById('renew-start') as HTMLInputElement).value,
    fin: (document.getElementById('renew-end') as HTMLInputElement).value,
  };
}

describe('LeaseRenewalDialog — défauts en jours calendaires, navigateur à Paris (P212.05)', () => {
  it('fin du parent le 2026-03-29 (passage à l’heure d’été) → début le 2026-03-30', () => {
    expect(defauts('2026-03-29')).toEqual({ debut: '2026-03-30', fin: '2027-03-30' });
  });

  it('fin du parent le 2026-10-25 → début le 2026-10-26, fin le 2027-10-26', () => {
    expect(defauts('2026-10-25')).toEqual({ debut: '2026-10-26', fin: '2027-10-26' });
  });
});
