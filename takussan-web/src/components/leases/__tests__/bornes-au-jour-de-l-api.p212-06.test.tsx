/**
 * P212.06 — deux bornes jugées par une règle `today` de l'API, en UTC :
 * - le préavis minimal de la résiliation anticipée (`EarlyTerminationService`,
 *   `now()->startOfDay()->addDays($notice)`) : `todayPlusDays` ajoutait les jours en heure locale
 *   puis relisait en UTC, et perdait un jour quand un changement d'heure tombait dans l'intervalle ;
 * - la validité d'un devis (`SubmitQuoteRequest`, `after_or_equal:today`) : le champ n'avait aucun
 *   `min`, une date passée se choisissait puis l'envoi était refusé.
 * Navigateur à Paris, fixé AVANT toute date.
 */
process.env.TZ = 'Europe/Paris';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { EarlyTerminationDialog } from '@/components/leases/EarlyTerminationDialog';
import { QuoteSubmitForm } from '@/components/maintenance/QuoteSubmitForm';
import frMessages from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import type { Lease } from '@/types/lease';
import type { MaintenanceRequest } from '@/types/maintenance';

vi.mock('@/lib/queries/leases', () => ({
  useRequestEarlyTermination: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/lib/queries/maintenance', () => ({
  useSubmitMaintenanceQuote: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false, error: null }),
}));

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
    <input id={id} type="date" data-min={min} value={value ?? ''} onChange={(e) => onValueChange(e.target.value)} />
  ),
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

function champ(id: string): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement;
}

describe('Bornes au jour de l’API, navigateur à Paris (P212.06)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('préavis de 30 jours depuis le 2026-02-28 (UTC) : au plus tôt le 2026-03-30', () => {
    vi.setSystemTime(new Date('2026-02-28T00:00:00Z'));
    const lease = makeLease({ notice_period_days: 30, end_date: '2026-12-31' });
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="fr" messages={frMessages}>
          <EarlyTerminationDialog open onOpenChange={() => {}} lease={lease} />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    const ids = Array.from(document.querySelectorAll('input[type="date"]'));
    expect(ids).toHaveLength(1);
    const input = ids[0] as HTMLInputElement;
    expect(input.dataset.min).toBe('2026-03-30');
    expect(input.value).toBe('2026-03-30');
  });

  it('la validité d’un devis est bornée au jour UTC : 22:30 Z le 24 (00:30 le 25 à Paris) → min 2026-10-24', () => {
    vi.setSystemTime(new Date('2026-10-24T22:30:00Z'));
    render(withIntl(<QuoteSubmitForm request={{ id: 7, status: 'quote_requested' } as MaintenanceRequest} />));
    expect(champ('quote-valid-until').dataset.min).toBe('2026-10-24');
  });
});
