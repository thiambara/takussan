import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { LeaseRenewalDialog } from '../LeaseRenewalDialog';
import frMessages from '@/messages/fr.json';
import type { Lease } from '@/types/lease';

// P231.01 (TCK-2316) — le bail renouvelé naît sans garant : le récapitulatif le dit avant la
// confirmation, au lieu de laisser croire que la caution suit le nouveau bail.
const garants = vi.hoisted(() => ({ liste: [] as Array<{ id: number }> }));

vi.mock('@/lib/queries/leases', () => ({
  useRenewLease: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ data: { id: 999 } }),
    isPending: false,
  }),
  useLeaseGuarantors: () => ({ data: { data: garants.liste } }),
}));

vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({
    id,
    value,
    onValueChange,
  }: {
    id?: string;
    value?: string;
    onValueChange: (v: string) => void;
  }) => (
    <input
      id={id}
      type="date"
      value={value ?? ''}
      onChange={(e) => onValueChange(e.target.value)}
    />
  ),
}));

const parent = {
  id: 1,
  reference_number: 'LS-AAAAAAAA',
  status: 'active',
  start_date: '2025-01-01',
  end_date: '2025-12-31',
  monthly_rent: 400_000,
  deposit_amount: 800_000,
  late_fee_percent: null,
  late_fee_grace_days: null,
  terms: null,
  currency: 'XOF',
} as unknown as Lease;

function recapitulatif() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="fr" messages={frMessages}>
        <LeaseRenewalDialog open onOpenChange={() => {}} parent={parent} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: /Suivant/i }));
  fireEvent.click(screen.getByRole('button', { name: /Suivant/i }));
}

describe('<LeaseRenewalDialog> — les garants du bail précédent', () => {
  it('le récapitulatif dit que les deux garants ne sont pas reportés', () => {
    garants.liste = [{ id: 1 }, { id: 2 }];
    recapitulatif();
    expect(
      screen.getByText(/Les 2 garants du bail actuel ne sont pas reportés/),
    ).toBeInTheDocument();
  });

  it('au singulier pour un seul garant', () => {
    garants.liste = [{ id: 1 }];
    recapitulatif();
    expect(screen.getByText(/Le garant du bail actuel n’est pas reporté/)).toBeInTheDocument();
  });

  it('sans garant au bail actuel, rien ne s’affiche', () => {
    garants.liste = [];
    recapitulatif();
    expect(screen.queryByText(/pas reporté/)).not.toBeInTheDocument();
  });
});
