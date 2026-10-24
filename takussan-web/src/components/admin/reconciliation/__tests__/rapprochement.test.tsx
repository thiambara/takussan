/**
 * TCK-593 (Partie 4, AC18) — l'écran de rapprochement bancaire.
 *
 * Ce qui doit se VOIR : un relevé en échec ou dont l'analyse a sauté des lignes, avec le compte ;
 * l'avancement « X / Y rapprochées » ; le sens de chaque ligne et la suggestion avec sa confiance.
 * Ce qui doit PARTIR : le séparateur décimal CHOISI, la suggestion validée d'un geste, le sens de la
 * ligne avec la recherche manuelle.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import type { BankStatement, BankStatementLine, CsvMapping } from '@/types/reconciliation';
import { CsvMappingForm } from '../CsvMappingForm';
import { StatementsList } from '../StatementsList';
import { StatementDetail } from '../StatementDetail';

const q = vi.hoisted(() => ({
  useBankStatements: vi.fn(),
  useBankStatement: vi.fn(),
  useBankStatementLines: vi.fn(),
  usePaymentSearch: vi.fn(),
  saveMapping: vi.fn(),
  match: vi.fn(),
  unmatch: vi.fn(),
  ignore: vi.fn(),
  finalize: vi.fn(),
}));

vi.mock('@/lib/queries/reconciliation', () => ({
  useBankStatements: q.useBankStatements,
  useBankStatement: q.useBankStatement,
  useBankStatementLines: q.useBankStatementLines,
  usePaymentSearch: q.usePaymentSearch,
  useSaveCsvMapping: () => ({ mutateAsync: q.saveMapping, isPending: false }),
  useMatchLine: () => ({ mutateAsync: q.match, isPending: false }),
  useUnmatchLine: () => ({ mutateAsync: q.unmatch, isPending: false }),
  useIgnoreLine: () => ({ mutateAsync: q.ignore, isPending: false }),
  useFinalizeStatement: () => ({ mutateAsync: q.finalize, isPending: false }),
}));

const texte = (s: string | null | undefined) => (s ?? '').replace(/[  ]/g, ' ');

function releve(surcharge: Partial<BankStatement>): BankStatement {
  return {
    id: 1,
    agency_id: 3,
    source_format: 'csv',
    bank_name: 'CBAO',
    account_iban_masked: null,
    period_start: '2026-09-01',
    period_end: '2026-09-30',
    lines_count: 5,
    skipped_lines_count: 0,
    status: 'ready_for_review',
    finalized_at: null,
    reconciled_ratio: { confirmed: 2, ignored: 1, remaining: 2, total: 5 },
    created_at: '2026-10-01T00:00:00Z',
    ...surcharge,
  };
}

const ok = <T,>(data: T) => ({ data, isLoading: false, isError: false, refetch: vi.fn() });

beforeEach(() => {
  vi.clearAllMocks();
  q.usePaymentSearch.mockReturnValue({ data: undefined, isLoading: false, isError: false });
});

describe('StatementsList — échecs et lignes sautées visibles (AC18)', () => {
  it('affiche le compte de lignes non lues et l’invitation à vérifier le mapping', () => {
    q.useBankStatements.mockReturnValue(ok({ data: [releve({ id: 7, skipped_lines_count: 3 })] }));
    render(withIntl(<StatementsList agencyId={3} />));
    expect(screen.getByTestId('releve-7-a-verifier')).toHaveTextContent(
      '3 lignes non lues — vérifiez le paramétrage CSV.',
    );
  });

  it('un relevé en échec le dit, avec son statut', () => {
    q.useBankStatements.mockReturnValue(ok({ data: [releve({ id: 8, status: 'failed', reconciled_ratio: null })] }));
    render(withIntl(<StatementsList agencyId={3} />));
    expect(screen.getByTestId('releve-8-a-verifier')).toHaveTextContent(fr.admin.reconciliation.list.failed);
    expect(screen.getByText(fr.admin.reconciliation.status.failed)).toBeInTheDocument();
  });

  it('un relevé sain ne porte aucune alerte, et montre « X / Y rapprochées »', () => {
    q.useBankStatements.mockReturnValue(ok({ data: [releve({ id: 9 })] }));
    render(withIntl(<StatementsList agencyId={3} />));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('2 / 5 rapprochées')).toBeInTheDocument();
  });

  it('chaque relevé ouvre son détail sous `/app/agency` (TCK-649)', () => {
    q.useBankStatements.mockReturnValue(ok({ data: [releve({ id: 9 })] }));
    render(withIntl(<StatementsList agencyId={3} />));
    expect(screen.getByRole('link', { name: 'CBAO' })).toHaveAttribute(
      'href',
      '/app/agency/finances/reconciliation/9',
    );
  });
});

const MAPPING: CsvMapping = {
  delimiter: ';',
  has_header: true,
  date_column: 'Date',
  date_format: 'd/m/Y',
  amount_column: 'Montant',
  label_column: 'Libellé',
  reference_column: null,
  counterparty_column: null,
  currency_column: null,
  sign_convention: 'amount_signed',
  direction_column: null,
  decimal_separator: null,
  thousands_separator: ' ',
};

describe('CsvMappingForm — le séparateur décimal est choisi et envoyé (AC18)', () => {
  it('envoie le séparateur décimal choisi', async () => {
    q.saveMapping.mockResolvedValue({});
    render(withIntl(<CsvMappingForm agencyId={3} initial={MAPPING} />));

    fireEvent.click(screen.getByRole('radio', { name: fr.admin.reconciliation.mapping.decimals.comma }));
    fireEvent.click(screen.getByRole('button', { name: fr.admin.reconciliation.mapping.save }));

    await waitFor(() => expect(q.saveMapping).toHaveBeenCalledTimes(1));
    expect(q.saveMapping.mock.calls[0][0]).toMatchObject({
      decimal_separator: ',',
      thousands_separator: ' ',
      delimiter: ';',
      amount_column: 'Montant',
    });
  });

  it('refuse d’enregistrer sans séparateur décimal, et le dit', async () => {
    render(withIntl(<CsvMappingForm agencyId={3} initial={MAPPING} />));
    fireEvent.click(screen.getByRole('button', { name: fr.admin.reconciliation.mapping.save }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      fr.admin.reconciliation.mapping.decimalRequired,
    );
    expect(q.saveMapping).not.toHaveBeenCalled();
  });

  it('reprend le séparateur que l’API rend', () => {
    render(withIntl(<CsvMappingForm agencyId={3} initial={{ ...MAPPING, decimal_separator: '.' }} />));
    expect(screen.getByRole('radio', { name: fr.admin.reconciliation.mapping.decimals.dot })).toBeChecked();
  });
});

function ligne(surcharge: Partial<BankStatementLine>): BankStatementLine {
  return {
    id: 100,
    bank_statement_id: 1,
    posted_at: '2026-09-06',
    amount: '150000.00',
    direction: 'credit',
    currency: 'XOF',
    label: 'VIR LOYER SEPT',
    reference: 'LP-2026-0012',
    counterparty: 'M. Diop',
    match_status: 'suggested',
    matched_payment_type: 'lease_payment',
    matched_payment_id: 12,
    matched_payment_status: 'pending',
    match_confidence: 0.92,
    ...surcharge,
  };
}

describe('StatementDetail — rapprocher ligne à ligne', () => {
  beforeEach(() => {
    q.useBankStatement.mockReturnValue(ok({ data: releve({}) }));
    q.useBankStatementLines.mockReturnValue(
      ok({
        data: [
          ligne({}),
          ligne({ id: 101, direction: 'debit', match_status: 'unmatched', matched_payment_type: null, matched_payment_id: null, match_confidence: null, amount: '50000.00' }),
          ligne({ id: 102, match_status: 'confirmed', match_confidence: null }),
        ],
        meta: { current_page: 1, last_page: 1, per_page: 50, total: 3 },
      }),
    );
  });

  it('le retour mène à la liste des relevés, sous `/app/agency` (TCK-649)', () => {
    render(withIntl(<StatementDetail agencyId={3} statementId={1} />));
    expect(screen.getByRole('link', { name: fr.admin.reconciliation.detail.back })).toHaveAttribute(
      'href',
      '/app/agency/finances/reconciliation',
    );
  });

  // TCK-1919 (P157.06, décision du porteur : marquer, ne pas sauter) — une ligne déjà importée par
  // un autre relevé de l'agence porte un badge ; les autres non.
  it('signale la ligne déjà importée par un autre relevé', () => {
    q.useBankStatementLines.mockReturnValue(
      ok({
        data: [ligne({ duplicate_of_line_id: 55 }), ligne({ id: 101, duplicate_of_line_id: null })],
        meta: { current_page: 1, last_page: 1, per_page: 50, total: 2 },
      }),
    );
    render(withIntl(<StatementDetail agencyId={3} statementId={1} />));
    expect(within(screen.getByTestId('ligne-100')).getByTestId('doublon-100')).toHaveTextContent(
      fr.admin.reconciliation.detail.duplicate,
    );
    expect(within(screen.getByTestId('ligne-101')).queryByTestId('doublon-101')).toBeNull();
  });

  it('montre le sens, la suggestion et sa confiance', () => {
    render(withIntl(<StatementDetail agencyId={3} statementId={1} />));
    const suggeree = screen.getByTestId('ligne-100');
    expect(within(suggeree).getByText(fr.admin.reconciliation.directions.credit)).toBeInTheDocument();
    expect(within(suggeree).getByText('Loyer n° 12')).toBeInTheDocument();
    expect(texte(within(suggeree).getByText(/Confiance/).textContent)).toBe('Confiance : 92 %');
    expect(within(screen.getByTestId('ligne-101')).getByText(fr.admin.reconciliation.directions.debit)).toBeInTheDocument();
  });

  // TCK-1522 (P110.02) — un encaissement rapproché puis remboursé garde sa ligne : la ligne le dit.
  it('montre le statut du payable rapproché, remboursé compris', () => {
    q.useBankStatementLines.mockReturnValue(
      ok({
        data: [
          ligne({ id: 102, match_status: 'confirmed', match_confidence: null, matched_payment_type: 'booking_payment', matched_payment_status: 'refunded' }),
          ligne({ id: 103, match_status: 'confirmed', match_confidence: null, matched_payment_type: 'invoice', matched_payment_status: 'paid' }),
          ligne({ id: 104, match_status: 'unmatched', matched_payment_type: null, matched_payment_id: null, matched_payment_status: null }),
        ],
        meta: { current_page: 1, last_page: 1, per_page: 50, total: 3 },
      }),
    );
    render(withIntl(<StatementDetail agencyId={3} statementId={1} />));
    expect(within(screen.getByTestId('ligne-102')).getByTestId('statut-payable-102')).toHaveTextContent(fr.payments.status.refunded);
    expect(within(screen.getByTestId('ligne-103')).getByTestId('statut-payable-103')).toHaveTextContent(fr.payments.invoiceStatus.paid);
    expect(within(screen.getByTestId('ligne-104')).queryByTestId('statut-payable-104')).toBeNull();
  });

  it('valide la suggestion d’un geste', async () => {
    q.match.mockResolvedValue({});
    render(withIntl(<StatementDetail agencyId={3} statementId={1} />));
    fireEvent.click(within(screen.getByTestId('ligne-100')).getByRole('button', { name: fr.admin.reconciliation.detail.validate }));
    await waitFor(() =>
      expect(q.match).toHaveBeenCalledWith({ lineId: 100, payment_type: 'lease_payment', payment_id: 12 }),
    );
  });

  it('ignore, délie, finalise', async () => {
    q.ignore.mockResolvedValue({});
    q.unmatch.mockResolvedValue({});
    q.finalize.mockResolvedValue({});
    render(withIntl(<StatementDetail agencyId={3} statementId={1} />));
    const d = fr.admin.reconciliation.detail;

    fireEvent.click(within(screen.getByTestId('ligne-101')).getByRole('button', { name: d.ignore }));
    await waitFor(() => expect(q.ignore).toHaveBeenCalledWith(101));
    fireEvent.click(within(screen.getByTestId('ligne-102')).getByRole('button', { name: d.unmatch }));
    await waitFor(() => expect(q.unmatch).toHaveBeenCalledWith(102));
    fireEvent.click(screen.getByRole('button', { name: d.finalize }));
    await waitFor(() => expect(q.finalize).toHaveBeenCalled());
  });

  it('la recherche manuelle porte le sens de la ligne, et rapproche le candidat choisi', async () => {
    q.match.mockResolvedValue({});
    q.usePaymentSearch.mockImplementation((_a: number, _q: string, _m: number | null, _d: string, _c: string | null, enabled: boolean) =>
      enabled
        ? ok({ data: [{ id: 5, type: 'payout', label: null, amount: '50000.00', currency: 'XOF', reference: 'PO-5', paid_at: null, payer_name: null }] })
        : { data: undefined, isLoading: false, isError: false },
    );
    render(withIntl(<StatementDetail agencyId={3} statementId={1} />));

    fireEvent.click(within(screen.getByTestId('ligne-101')).getByRole('button', { name: fr.admin.reconciliation.detail.search }));
    const dialogue = await screen.findByRole('dialog');
    fireEvent.click(within(dialogue).getByRole('button', { name: fr.admin.reconciliation.search.submit }));

    const appels = q.usePaymentSearch.mock.calls.filter((c) => c[5] === true);
    // P157.01 (TCK-1917) — la devise de la ligne part avec la recherche.
    expect(appels.at(-1)?.slice(0, 5)).toEqual([3, 'LP-2026-0012', 50000, 'debit', 'XOF']);

    fireEvent.click(await within(dialogue).findByRole('button', { name: fr.admin.reconciliation.search.choose }));
    await waitFor(() => expect(q.match).toHaveBeenCalledWith({ lineId: 101, payment_type: 'payout', payment_id: 5 }));
  });

  // TCK-1526 (P110.04) — un acompte remboursé reste candidat, et le dit ; il reste choisissable.
  it('la recherche manuelle montre le statut de chaque candidat, sans l’écarter', async () => {
    q.match.mockResolvedValue({});
    q.usePaymentSearch.mockImplementation((_a: number, _q: string, _m: number | null, _d: string, _c: string | null, enabled: boolean) =>
      enabled
        ? ok({
            data: [
              { id: 7, type: 'booking_payment', label: null, amount: '70000.00', currency: 'XOF', reference: 'BP-7', paid_at: null, payer_name: null, status: 'refunded' },
              { id: 8, type: 'invoice', label: null, amount: '70000.00', currency: 'XOF', reference: 'FA-8', paid_at: null, payer_name: null, status: 'sent' },
            ],
          })
        : { data: undefined, isLoading: false, isError: false },
    );
    render(withIntl(<StatementDetail agencyId={3} statementId={1} />));

    fireEvent.click(within(screen.getByTestId('ligne-100')).getByRole('button', { name: fr.admin.reconciliation.detail.search }));
    const dialogue = await screen.findByRole('dialog');
    fireEvent.click(within(dialogue).getByRole('button', { name: fr.admin.reconciliation.search.submit }));

    expect(await within(dialogue).findByTestId('statut-candidat-booking_payment-7')).toHaveTextContent(fr.payments.status.refunded);
    expect(within(dialogue).getByTestId('statut-candidat-invoice-8')).toHaveTextContent(fr.payments.invoiceStatus.sent);

    fireEvent.click(within(dialogue).getAllByRole('button', { name: fr.admin.reconciliation.search.choose })[0]);
    await waitFor(() => expect(q.match).toHaveBeenCalledWith({ lineId: 100, payment_type: 'booking_payment', payment_id: 7 }));
  });

  // Ajouté après vérification adverse (AC18b) : seule la LISTE était éprouvée — forcer le compte
  // à 0 dans le détail laissait la suite verte.
  it('le détail dit combien de lignes ont été sautées, et qu’un relevé a échoué', () => {
    q.useBankStatement.mockReturnValue(ok({ data: releve({ skipped_lines_count: 3 }) }));
    const { unmount } = render(withIntl(<StatementDetail agencyId={3} statementId={1} />));
    expect(screen.getByRole('alert')).toHaveTextContent('3 lignes non lues — vérifiez le paramétrage CSV.');
    unmount();

    q.useBankStatement.mockReturnValue(ok({ data: releve({ status: 'failed', reconciled_ratio: null }) }));
    render(withIntl(<StatementDetail agencyId={3} statementId={1} />));
    expect(screen.getByRole('alert')).toHaveTextContent(fr.admin.reconciliation.list.failed);
  });

  it('un relevé finalisé ne propose plus aucun geste', () => {
    q.useBankStatement.mockReturnValue(ok({ data: releve({ status: 'reconciled', finalized_at: '2026-10-02T00:00:00Z' }) }));
    render(withIntl(<StatementDetail agencyId={3} statementId={1} />));
    expect(screen.queryByRole('button', { name: fr.admin.reconciliation.detail.finalize })).toBeNull();
    expect(screen.queryByRole('button', { name: fr.admin.reconciliation.detail.validate })).toBeNull();
  });
});
