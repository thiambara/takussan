/**
 * TCK-2749 — l'admin d'agence qui est AUSSI bailleur dans l'agence active trouve son relevé de
 * gérance dans « Argent », au registre « Reversements », là où l'ancien écran le lui donnait
 * (`PaymentsTabs`, onglet `payouts`) : un geste depuis le point du mois (l'onglet au bureau, la ligne
 * « Reversements » au téléphone). Un admin qui n'est pas bailleur n'en voit aucun.
 *
 * Le panneau est le même composant (`OwnerStatementPanel`, sans `landlordId` : le relevé du
 * lecteur) ; ses calculs et ses téléchargements ont leurs tests (`components/payments/__tests__`).
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminFinancesClient } from '@/app/(dashboard)/app/agency/finances/AdminFinancesClient';
import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import type { UserRole } from '@/types/user';

const { etat } = vi.hoisted(() => ({
  etat: { recherche: '', telephone: false, roles: [] as UserRole[] },
}));

vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: true, isLoading: false }) }));
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: () => etat.telephone }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/app/agency/finances',
  useSearchParams: () => new URLSearchParams(etat.recherche),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 't', user: { id: 2, roles: etat.roles, agency_id: 1 } }) }));

vi.mock('@/lib/queries/agency-reporting', () => ({
  useFinanceSummary: () => ({ data: undefined, isLoading: false, error: null }),
}));
vi.mock('@/lib/queries/payments', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/payments')>()),
  usePaymentsHistory: () => ({ data: undefined, isLoading: false }),
  usePayouts: () => ({ data: undefined, isLoading: false }),
}));
vi.mock('@/components/admin/finances/argent/EncaissementsAgence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/admin/finances/argent/EncaissementsAgence')>()),
  EncaissementsAgence: () => <div data-testid="encaissements" />,
}));
vi.mock('@/components/payments/InvoicesTable', () => ({ InvoicesTable: () => null }));
vi.mock('@/components/payments/PayoutsTable', () => ({
  PayoutsTable: ({ status }: { status?: string }) => <div data-testid="reversements-de-l-agence" data-statut={status ?? ''} />,
}));
vi.mock('@/components/payments/OwnerStatementPanel', () => ({
  OwnerStatementPanel: (props: { landlordId?: number }) => (
    <div data-testid="releve-du-bailleur" data-bailleur={props.landlordId === undefined ? 'lecteur' : String(props.landlordId)} />
  ),
}));
vi.mock('@/components/payments/CreateInvoiceDialog', () => ({ CreateInvoiceDialog: () => null }));
vi.mock('@/components/payments/CreatePayoutDialog', () => ({ CreatePayoutDialog: () => null }));
vi.mock('@/components/payments/InvoiceDetailDialog', () => ({ InvoiceDetailDialog: () => null }));
vi.mock('@/components/payments/PayoutDetailDialog', () => ({ PayoutDetailDialog: () => null }));
vi.mock('@/components/admin/finances/impayes/Impayes', () => ({ Impayes: () => null, useResumeDesImpayes: () => null }));
vi.mock('@/components/payments/ServiceProviderBillsTable', () => ({ ServiceProviderBillsTable: () => null }));

const REVERSEMENTS = fr.admin.finances.tabs.payouts;

function rendre() {
  return render(withIntl(<AdminFinancesClient canViewFinances canEmitFinances agencyId={1} />));
}

beforeEach(() => {
  etat.recherche = 'tab=reversements';
  etat.telephone = false;
  etat.roles = ['agency_admin', 'owner'];
});

describe('TCK-2749 — le relevé de l’admin bailleur dans « Argent »', () => {
  it('bureau — « Reversements » porte SON relevé (celui du lecteur), au-dessus des reversements de l’agence', () => {
    rendre();

    expect(screen.getByRole('tab', { name: REVERSEMENTS })).toHaveAttribute('aria-selected', 'true');
    const releve = screen.getByTestId('releve-du-bailleur');
    expect(releve).toHaveAttribute('data-bailleur', 'lecteur');
    const table = screen.getByTestId('reversements-de-l-agence');
    // L'ordre de l'ancien onglet `payouts` : le relevé, puis la table.
    expect(releve.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('téléphone — le registre « Reversements » le porte aussi', () => {
    etat.telephone = true;
    rendre();

    expect(screen.getByTestId('releve-du-bailleur')).toBeInTheDocument();
    expect(screen.getByTestId('reversements-de-l-agence')).toBeInTheDocument();
  });

  it('AC3 — un admin qui n’est pas bailleur ne voit aucun relevé de bailleur', () => {
    etat.roles = ['agency_admin', 'customer'];
    rendre();

    expect(screen.getByTestId('reversements-de-l-agence')).toBeInTheDocument();
    expect(screen.queryByTestId('releve-du-bailleur')).not.toBeInTheDocument();
  });

  it('« À approuver » reste la file de l’agence, sans relevé', () => {
    etat.recherche = 'tab=a-approuver';
    rendre();

    expect(screen.getByTestId('reversements-de-l-agence')).toHaveAttribute('data-statut', 'awaiting_approval');
    expect(screen.queryByTestId('releve-du-bailleur')).not.toBeInTheDocument();
  });
});
