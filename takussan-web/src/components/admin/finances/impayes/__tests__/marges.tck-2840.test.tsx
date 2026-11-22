/**
 * TCK-2840 — l'écran Impayés tombe sur la maquette regelée (TCK-2822) :
 *
 * 1. Les lignes clés du dossier (échéances, pénalité, caution, « Ancienneté du dû ») ne sont pas
 *    interactives : elles ne portent pas la cible tactile `min-h-11`, seulement `py-2` (33,4 px à 1280,
 *    contre 39,6 avec la cible).
 * 2. Au téléphone, le contenu commence 20 px sous l'en-tête (`pt-3` de la page + `pt-2` du résumé) : le
 *    panneau de l'onglet n'y ajoute pas son `pt-4` du bureau (36 px mesurés, 2026-11-14).
 *
 * Les hauteurs se mesurent au navigateur (fiche TCK-2660) ; jsdom ne dispose rien : ces tests gardent
 * les classes qui les produisent.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AdminFinancesTabs } from '@/components/admin/finances/AdminFinancesTabs';
import type { GestesDeLArgent } from '@/components/admin/finances/argent/gestes';
import { withIntl } from '@/test/intl';
import type { PaymentHistoryRow } from '@/types/invoice';

import { DossierDImpaye } from '../DossierDImpaye';

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/components/admin/finances/impayes/Impayes', () => ({ Impayes: () => <p>contenu des impayés</p> }));
vi.mock('@/components/admin/finances/argent/EncaissementsAgence', () => ({ EncaissementsAgence: () => null }));
vi.mock('@/components/payments/InvoicesTable', () => ({ InvoicesTable: () => null }));
vi.mock('@/components/payments/PayoutsTable', () => ({ PayoutsTable: () => null }));
vi.mock('@/components/payments/OwnerStatementPanel', () => ({ OwnerStatementPanel: () => null }));
vi.mock('@/components/payments/ServiceProviderBillsTable', () => ({ ServiceProviderBillsTable: () => null }));

vi.mock('@/lib/queries/payments', () => ({ usePaymentsHistory: () => ({ isPending: false, data: undefined }) }));
vi.mock('@/lib/queries/leases', () => ({ useDepositRefundState: () => ({ data: { data: { deposit_remaining: 150000 } } }) }));
vi.mock('@/lib/queries/relances', () => ({ useRelancesDeLEcheance: () => ({ isPending: false, data: { data: [] } }) }));
vi.mock('@/lib/queries/agency-reporting', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/agency-reporting')>()),
  useAgingBalance: () => ({
    data: {
      data: {
        rows: [
          {
            id: 7,
            buckets: {
              '1_30': { count: 1, amount: 100000 },
              '31_60': { count: 0, amount: 0 },
              '61_90': { count: 0, amount: 0 },
              '90_plus': { count: 2, amount: 300000 },
            },
          },
        ],
      },
    },
  }),
}));

const ROW = {
  id: 602,
  source: 'lease',
  status: 'overdue',
  days_late: 34,
  amount_due: 250000,
  remaining_amount: 250000,
  late_fee_amount: 5000,
  late_fee_payable_online: true,
  currency: 'XOF',
  due_date: '2026-10-05',
  lease_id: 11,
  payer: { id: 7, name: 'Coumba Diop', phone: '+221771234567' },
  landlord: { name: 'Moussa Ndiaye' },
  last_reminder: null,
} as unknown as PaymentHistoryRow;

describe('TCK-2840 — les lignes clés du dossier', () => {
  it('aucune ligne clé ne porte la cible tactile `min-h-11` : `py-2` seulement, comme la maquette', () => {
    const { container } = render(withIntl(<DossierDImpaye agencyId={1} row={ROW} url={null} />));
    const anciennete = container.querySelector('[data-slot="anciennete-du-du"]');
    expect(anciennete?.children).toHaveLength(4);
    // Toutes les lignes clés : échéance, pénalité, caution, puis les quatre tranches.
    const lignes = [...container.querySelectorAll('[data-slot="dossier-impaye"] .divide-y > div')];
    expect(lignes.length).toBeGreaterThanOrEqual(7);
    for (const ligne of lignes) {
      expect(ligne.className).toContain('py-2');
      expect(ligne.className).not.toMatch(/\bmin-h-/);
    }
  });
});

describe('TCK-2840 — la marge haute du registre Impayés', () => {
  const gestes = { peutApprouver: false, peutPayerLesPrestataires: false } as unknown as GestesDeLArgent;
  const rendre = (telephone: boolean) =>
    render(
      withIntl(
        <AdminFinancesTabs onglet="impayes" onChange={() => {}} gestes={gestes} telephone={telephone} variante="registre" courant="2026-11" agencyId={1} />,
      ),
    );

  it('au téléphone, le panneau de l’onglet n’ajoute aucune marge haute (la page pose `pt-3`, le résumé `pt-2`)', () => {
    rendre(true);
    const panneau = screen.getByText('contenu des impayés').closest('[role="tabpanel"]');
    expect(panneau).not.toBeNull();
    expect(panneau?.className ?? '').not.toMatch(/(^|\s)(pt|py|p|mt|my)-/);
  });

  it('au bureau, le panneau garde son `pt-4` sous la barre d’onglets', () => {
    rendre(false);
    const panneau = screen.getByText('contenu des impayés').closest('[role="tabpanel"]');
    expect(panneau?.className).toMatch(/(^|\s)pt-4(\s|$)/);
  });
});
