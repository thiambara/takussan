/**
 * TCK-2750 (AC3) — changer de filtre revient à la première page du registre « Interventions ».
 *
 * La page vit dans l'adresse (`?page=`, comme « Factures » et « Reversements ») : ce qui change de
 * filtre doit la réécrire sans `page`, sinon on ouvrirait la page 2 d'un autre registre — ou une page
 * au-delà de la dernière, qui dirait « aucune facture » quand il y en a. La pagination elle-même a
 * ses tests (`components/payments/__tests__/ServiceProviderBillsTable.tck-2750.test.tsx`).
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminFinancesClient } from '@/app/(dashboard)/app/agency/finances/AdminFinancesClient';
import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';

const { etat } = vi.hoisted(() => ({
  etat: { recherche: '', telephone: false, accordees: new Set<string>(), enCours: false, replace: [] as string[] },
}));

vi.mock('@/hooks/useCan', () => ({
  useCan: (c: string) => ({ can: !etat.enCours && etat.accordees.has(c), isLoading: etat.enCours }),
}));
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: () => etat.telephone }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: (href: string) => etat.replace.push(href), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/app/agency/finances',
  useSearchParams: () => new URLSearchParams(etat.recherche),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 't', user: null }) }));

vi.mock('@/lib/queries/agency-reporting', () => ({
  useFinanceSummary: () => ({ data: undefined, isLoading: false, error: null }),
}));
vi.mock('@/lib/queries/payments', () => ({
  usePaymentsHistory: () => ({ data: undefined, isLoading: false }),
  usePayouts: () => ({ data: undefined, isLoading: false }),
}));
vi.mock('@/components/admin/finances/argent/EncaissementsAgence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/admin/finances/argent/EncaissementsAgence')>()),
  EncaissementsAgence: () => <div data-testid="encaissements" />,
}));
vi.mock('@/components/payments/InvoicesTable', () => ({ InvoicesTable: () => null }));
vi.mock('@/components/payments/PayoutsTable', () => ({ PayoutsTable: () => null }));
vi.mock('@/components/payments/CreateInvoiceDialog', () => ({ CreateInvoiceDialog: () => null }));
vi.mock('@/components/payments/CreatePayoutDialog', () => ({ CreatePayoutDialog: () => null }));
vi.mock('@/components/payments/InvoiceDetailDialog', () => ({ InvoiceDetailDialog: () => null }));
vi.mock('@/components/payments/PayoutDetailDialog', () => ({
  PayoutDetailDialog: ({ payoutId }: { payoutId: number | null }) => (payoutId ? <div data-testid="detail-reversement">{payoutId}</div> : null),
}));
vi.mock('@/components/admin/finances/impayes/Impayes', () => ({ Impayes: () => null, useResumeDesImpayes: () => null }));
vi.mock('@/components/payments/ServiceProviderBillsTable', () => ({
  ServiceProviderBillsTable: ({ mode, onPaid, titreMasque }: { mode: string; onPaid?: (id: number) => void; titreMasque?: boolean }) => (
    <div data-testid="factures-prestataires" data-mode={mode} data-titre-masque={String(Boolean(titreMasque))}>
      <button type="button" onClick={() => onPaid?.(77)}>
        payer
      </button>
    </div>
  ),
}));

function rendre() {
  return render(withIntl(<AdminFinancesClient canViewFinances canEmitFinances agencyId={1} />));
}

beforeEach(() => {
  etat.recherche = '';
  etat.replace = [];
  etat.telephone = false;
  etat.enCours = false;
  etat.accordees = new Set(['payouts.create', 'invoices.create', 'payouts.approve']);
});

describe('TCK-2750 — « Interventions » : un autre filtre repart de la page 1', () => {
  it('changer d’onglet depuis la page 2 réécrit l’adresse sans `page`, le mois gardé', async () => {
    etat.recherche = 'tab=interventions&period=2026-10&page=2';
    rendre();

    await userEvent.click(screen.getByRole('tab', { name: fr.admin.finances.tabs.invoices }));
    const href = etat.replace.at(-1) ?? '';
    const params = new URLSearchParams(href.slice(href.indexOf('?') + 1));
    expect(params.get('tab')).toBe('factures');
    expect(params.get('period')).toBe('2026-10');
    expect(params.has('page')).toBe(false);
  });
});
