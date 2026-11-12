/**
 * TCK-2677 — « Argent » sert ce que l'onglet `bills` de `/app/payments` servait à l'admin : le
 * registre « Interventions » (factures des prestataires, TCK-594), avec SA capacité
 * (`payouts.create`, comme l'ancien onglet), au bureau comme au téléphone.
 *
 * La table est la même (`ServiceProviderBillsTable mode="agency"`) : ses gestes ont leurs tests
 * (`components/payments/__tests__`). Ici, qu'elle soit montée, où, et pour qui.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminFinancesClient } from '@/app/(dashboard)/app/agency/finances/AdminFinancesClient';
import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';

const { etat } = vi.hoisted(() => ({
  etat: { recherche: '', telephone: false, accordees: new Set<string>(), enCours: false },
}));

vi.mock('@/hooks/useCan', () => ({
  useCan: (c: string) => ({ can: !etat.enCours && etat.accordees.has(c), isLoading: etat.enCours }),
}));
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: () => etat.telephone }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
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

const INTERVENTIONS = fr.admin.finances.tabs.interventions;

function rendre() {
  return render(withIntl(<AdminFinancesClient canViewFinances canEmitFinances agencyId={1} />));
}

beforeEach(() => {
  etat.recherche = '';
  etat.telephone = false;
  etat.enCours = false;
  etat.accordees = new Set(['payouts.create', 'invoices.create', 'payouts.approve']);
});

describe('TCK-2677 — le registre « Interventions » de « Argent »', () => {
  it('bureau — `?tab=interventions` ouvre le registre : titre, onglet actif, la table de l’agence', () => {
    etat.recherche = 'tab=interventions';
    rendre();

    expect(screen.getByRole('heading', { level: 1, name: INTERVENTIONS })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: INTERVENTIONS })).toHaveAttribute('aria-selected', 'true');
    const table = screen.getByTestId('factures-prestataires');
    expect(table).toHaveAttribute('data-mode', 'agency');
    // L'en-tête du registre porte le titre : celui de la table ne se répète pas à l'écran.
    expect(table).toHaveAttribute('data-titre-masque', 'true');
  });

  it('« Payer le prestataire » ouvre le reversement créé, comme dans l’ancien onglet', async () => {
    etat.recherche = 'tab=interventions';
    rendre();

    await userEvent.click(within(screen.getByTestId('factures-prestataires')).getByRole('button', { name: 'payer' }));
    expect(screen.getByTestId('detail-reversement')).toHaveTextContent('77');
  });

  it('bureau — l’onglet figure sous le point du mois, entre « À approuver » et « Impayés »', () => {
    rendre();

    const noms = screen.getAllByRole('tab').map((t) => t.textContent?.trim());
    const i = noms.indexOf(INTERVENTIONS);
    expect(i).toBeGreaterThan(noms.findIndex((n) => n?.startsWith(fr.admin.finances.tabs.toApprove)));
    expect(noms[i + 1]).toMatch(new RegExp(`^${fr.admin.finances.tabs.overdue}`));
  });

  it('sans `payouts.create` : ni onglet, ni table, et `?tab=interventions` retombe sur les encaissements', () => {
    etat.accordees = new Set(['invoices.create']);
    etat.recherche = 'tab=interventions';
    rendre();

    expect(screen.queryByRole('tab', { name: INTERVENTIONS })).toBeNull();
    expect(screen.queryByTestId('factures-prestataires')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: fr.admin.finances.tabs.payments })).toBeInTheDocument();
  });

  it('tant que les capacités se lisent, le registre demandé tient (pas d’encaissements le temps d’une lecture)', () => {
    etat.enCours = true;
    etat.recherche = 'tab=interventions';
    rendre();

    expect(screen.getByRole('heading', { level: 1, name: INTERVENTIONS })).toBeInTheDocument();
    expect(screen.queryByTestId('encaissements')).toBeNull();
  });

  it('téléphone — « Tout voir » mène au registre, avec `payouts.create` seulement', () => {
    etat.telephone = true;
    const { unmount } = rendre();

    const lien = screen.getByRole('link', { name: new RegExp(fr.admin.finances.argent.registres.interventions) });
    expect(lien).toHaveAttribute('href', '/app/agency/finances?tab=interventions');
    expect(lien).toHaveTextContent(fr.admin.finances.argent.registres.interventionsDetail);
    unmount();

    etat.accordees = new Set(['invoices.create']);
    rendre();
    expect(screen.queryByRole('link', { name: new RegExp(fr.admin.finances.argent.registres.interventions) })).toBeNull();
  });

  it('téléphone — le registre est un écran de détail qui monte la table', () => {
    etat.telephone = true;
    etat.recherche = 'tab=interventions';
    rendre();

    expect(screen.getByTestId('factures-prestataires')).toBeInTheDocument();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });
});
