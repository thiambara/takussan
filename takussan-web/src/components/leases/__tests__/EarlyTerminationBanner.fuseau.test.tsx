/**
 * TCK-1827 (P183.04) — le compte à rebours d'une résiliation anticipée compte les jours
 * calendaires (ADR-0018), comme l'API juge la fenêtre d'annulation : ouverte tant que la date
 * effective est postérieure au jour UTC (`EarlyTerminationService`, `now()` en UTC).
 *
 * `daysFromTodayTo` lisait la date `Y-m-d` à minuit UTC puis la ramenait à minuit LOCAL : à
 * 2026-10-31T15:00Z et pour une date effective au 2026-11-01, un navigateur à New York ou à Tokyo
 * comptait 0 jour, titrait « Fin aujourd'hui » et cachait le bouton d'annulation que l'API accepte.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const TZ_DEPART = process.env.TZ;

function bail(): Lease {
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
    early_termination_requested_at: '2026-10-01T10:00:00Z',
    early_termination_requested_by: 20,
    early_termination_effective_date: '2026-11-01',
    early_termination_penalty_amount: 800_000,
    early_termination_reason: null,
    early_termination_invoice_id: null,
    notice_period_days: 30,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
  };
}

function monter() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="fr" messages={frMessages}>
        <Toast.Provider>
          <EarlyTerminationBanner lease={bail()} />
        </Toast.Provider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-31T15:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  process.env.TZ = TZ_DEPART;
});

describe('EarlyTerminationBanner — jours comptés en dates calendaires (TCK-1827)', () => {
  it.each(['Africa/Dakar', 'America/New_York', 'Asia/Tokyo'])(
    'sous %s, la veille UTC de la date effective, la fenêtre reste ouverte',
    (fuseau) => {
      process.env.TZ = fuseau;
      monter();

      const bandeau = screen.getByTestId('early-termination-banner');
      expect(bandeau).toHaveTextContent('Fin dans 1 jours');
      expect(screen.getByRole('button', { name: /Annuler la résiliation/i })).toBeInTheDocument();
    },
  );

  it('le jour UTC de la date effective, la fenêtre est close', () => {
    process.env.TZ = 'America/New_York';
    vi.setSystemTime(new Date('2026-11-01T02:00:00Z'));
    monter();

    expect(screen.getByTestId('early-termination-banner')).toHaveTextContent("Fin aujourd'hui");
    expect(screen.queryByRole('button', { name: /Annuler la résiliation/i })).toBeNull();
  });
});

/**
 * TCK-1829 (P183.05) — la date effective passait brute au libellé : « Date effective : 2026-11-01 ».
 */
describe('EarlyTerminationBanner — date effective dans la langue du lecteur (TCK-1829)', () => {
  it('formate la date effective', () => {
    monter();

    const bandeau = screen.getByTestId('early-termination-banner');
    expect(bandeau).toHaveTextContent('Date effective : 1 nov. 2026');
    expect(bandeau).not.toHaveTextContent('2026-11-01');
  });
});
