import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toast } from '@base-ui/react/toast';

import { EarlyTerminationBanner } from '../EarlyTerminationBanner';
import frMessages from '@/messages/fr.json';
import type { Lease } from '@/types/lease';
import type { UserRole } from '@/types/user';

/**
 * TCK-1365 (P131.03) — le numéro de la facture de résiliation mène, par un `Link`, à l'onglet des
 * factures pour l'équipe, et à la page de paiements (`CustomerPayments`) pour le client. Avant,
 * un `<a>` visait `/app/payments?invoice=<id>`, paramètre que rien ne lit : l'historique s'ouvrait.
 */

let roles: UserRole[] = [];

vi.mock('@/lib/queries/leases', () => ({
  useCancelEarlyTermination: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, roles } }),
}));

function bail(): Lease {
  return {
    id: 1,
    status: 'terminating',
    currency: 'XOF',
    early_termination_effective_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
      .toISOString()
      .slice(0, 10),
    early_termination_penalty_amount: 800_000,
    early_termination_invoice_id: 42,
  } as Lease;
}

function monter() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="fr" messages={frMessages}>
        <Toast.Provider>
          <EarlyTerminationBanner lease={bail()} />
        </Toast.Provider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return screen.getByRole('link', { name: '#42' });
}

describe('<EarlyTerminationBanner> — lien de la facture de résiliation (TCK-1365)', () => {
  beforeEach(() => {
    roles = [];
  });

  it("mène l'équipe à l'onglet des factures", () => {
    roles = ['agent'];
    expect(monter().getAttribute('href')).toBe('/app/payments?tab=invoices');
  });

  it('mène le client à sa page de paiements', () => {
    roles = ['customer'];
    expect(monter().getAttribute('href')).toBe('/app/payments');
  });
});
