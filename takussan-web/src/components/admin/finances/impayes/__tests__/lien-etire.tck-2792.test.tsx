/**
 * TCK-2792 — le nom du locataire d'une carte d'impayé (téléphone) est un lien ÉTIRÉ sur la tête de la carte :
 * l'avatar, le nom, le bien, le reste dû et le retard. La case de la file de relance (TCK-2682) reste au-dessus,
 * « Relancer sur WhatsApp » et « Appeler » restent hors de la zone.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { attendreLienEtire } from '@/test/lien-etire';
import { withIntl } from '@/test/intl';
import type { PaymentHistoryRow } from '@/types/invoice';

import { CarteDImpaye } from '../CarteDImpaye';

vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

const RANGEE = {
  source: 'lease',
  id: 1,
  reference_number: 'LP-1',
  amount: 250_000,
  currency: 'XOF',
  payment_method: null,
  payment_type: 'rent',
  status: 'late',
  paid_amount: 0,
  remaining_amount: 250_000,
  amount_due: 250_000,
  late_fee_amount: null,
  date: '2026-10-01T00:00:00Z',
  paid_at: null,
  period_start: '2026-10-01',
  period_end: '2026-10-31',
  due_date: '2026-10-07',
  booking_id: null,
  lease_id: 101,
  property_id: 201,
  customer_id: 301,
  created_at: '2026-09-01T00:00:00Z',
  days_late: 37,
  payer: { id: 301, name: 'Awa Ndiaye', phone: '+221771234567', first_name: 'Awa', locale: null },
  property: { id: 201, title: 'Studio Mermoz', reference_number: null },
  landlord: { id: 50, name: 'Mme Seck' },
  last_reminder: null,
  reminders_count: 0,
} as PaymentHistoryRow;

function monter(selection?: { readonly cochee: boolean; readonly onCocher: (c: boolean) => void }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(<QueryClientProvider client={client}><CarteDImpaye row={RANGEE} onRelancer={() => {}} selection={selection} /></QueryClientProvider>));
  const lien = screen.getByRole('link', { name: 'Awa Ndiaye' });
  const carte = lien.closest<HTMLElement>('[data-slot="carte-impaye"]') as HTMLElement;
  return { lien, carte };
}

describe('TCK-2792 — la carte d’impayé : le nom du locataire, lien étiré sur la tête', () => {
  it('la zone du lien est la tête de la carte (avatar, bien, reste dû, retard), sans les deux gestes', () => {
    const { lien, carte } = monter();
    const zone = attendreLienEtire(lien, {
      carte,
      temoins: [screen.getByText('AN'), screen.getByText('Studio Mermoz'), screen.getByText(/retard/i)],
      gestes: [screen.getByRole('button', { name: /Relancer sur WhatsApp/ }), screen.getByRole('link', { name: /Appeler/ })],
    });
    expect(lien).toHaveAttribute('href', '/app/customers/301');
    expect(zone).not.toBe(carte);
  });

  it('en mode sélection (TCK-2682), la case reste posée au-dessus de la zone du nom', () => {
    const { lien, carte } = monter({ cochee: false, onCocher: () => {} });
    const coche = screen.getByRole('checkbox', { name: /Awa Ndiaye/ });
    const zone = attendreLienEtire(lien, { carte, temoins: [screen.getByText('AN')] });
    expect(zone.contains(coche)).toBe(true);
  });
});
