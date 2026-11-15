/**
 * TCK-2651 (ADR-0100 § 2, amendement du 2026-11-12) — « Loyers », la page d'argent du bailleur.
 *
 * - AC1 : « Reste à vous verser » est `balance.remaining_to_pay` (le solde cumulé au jour), jamais
 *   `totals.remaining_to_pay` (l'écart du mois) — la réponse simulée les fait différer ; changer de
 *   mois change la ventilation, pas ce montant.
 * - AC2 : « Par bien » rend une ligne par élément de `properties[]`, titre et locataire nommés.
 * - AC3 : dans les quatre onglets, dialogues de détail ouverts, ni « ID entité » ni `#n` — sur des
 *   lignes SANS `reference_number`, là où le repli `#id` s'affichait.
 * - AC4 : le sélecteur dit « novembre 2026 » et en change par `period=` ; aucun `type="month"`.
 * - Les exports : le relevé PDF et CSV de la période, l'attestation de l'année, avec le jeton.
 * - Non-fuite côté écran : le relevé est celui du LECTEUR (aucun `landlord_id`), le registre ne lit
 *   que SES opérations (`filter[landlord_id]` = lui).
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { OwnerStatement } from '@/types/invoice';

import { LoyersDuBailleur } from '../LoyersDuBailleur';

const ADRESSE = vi.hoisted(() => ({ courante: '' }));
// Décision 18 : des biens ajoutés au relevé simulé par un test, vidés avant chacun.
const BIENS_EN_PLUS = vi.hoisted(() => ({ liste: [] as Record<string, unknown>[] }));
const ROUTEUR = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ROUTEUR,
  usePathname: () => '/app/payments',
  useSearchParams: () => new URLSearchParams(ADRESSE.courante),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 41, roles: ['owner'] }, token: 'jeton-de-session' }) }));
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: false, isLoading: false }) }));
vi.mock('@/hooks/usePaymentProviders', () => ({ usePaymentProviders: () => ({ providers: [] }) }));
vi.mock('@/components/documents/BoutonTelechargement', () => ({ BoutonTelechargement: () => null }));

type Releve = OwnerStatement & { totals: OwnerStatement['totals'] & { remaining_to_pay: number } };

function releveDe(period: string): Releve {
  const octobre = period === '2026-10';
  return {
    agency: { id: 3, name: 'Dakar Immo' },
    landlord: { id: 41, name: 'Mme Diop', company_name: null },
    period,
    annual: false,
    period_start: `${period}-01`,
    period_end: `${period}-30`,
    currency: 'XOF',
    // L'écart DU MOIS : net − versé du mois. Jamais affiché sous « Reste à vous verser ».
    totals: octobre
      ? { gross: 900000, commission: 67500, fees: 0, net: 832500, paid_out: 700000, remaining_to_pay: 132500 }
      : { gross: 1100000, commission: 82500, fees: 0, net: 1017500, paid_out: 832500, remaining_to_pay: 185000 },
    // Le solde cumulé au jour : le même quel que soit le mois.
    balance: { remaining_to_pay: 1847300, as_of: '2026-11-14' },
    next_payout: { id: 77, scheduled_at: '2026-11-15T09:00:00Z', payment_method: 'bank_transfer', status: 'scheduled', net_amount: 1017500 },
    properties: [
      { property_id: 11, title: 'Villa Almadies', tenant_name: 'Awa Ndiaye', expected_rent: 650000, collected: 650000, commission: 48750, fees: 0, net: 601250, has_movements: true, month_status: 'paid', days_late: null },
      { property_id: 12, title: 'Studio Plateau', tenant_name: 'Moussa Fall', expected_rent: 450000, collected: 450000, commission: 33750, fees: 0, net: 416250, has_movements: true, month_status: 'paid', days_late: null },
      { property_id: 13, title: 'Garage Ouest Foire', tenant_name: 'Ibou Sarr', expected_rent: 255000, collected: 0, commission: 0, fees: 0, net: 0, has_movements: false, month_status: 'late', days_late: 6 },
      ...(BIENS_EN_PLUS.liste as unknown as NonNullable<OwnerStatement['properties']>),
    ],
    lines: { lease_payments: [{ commission_rate: 7.5 }, { commission_rate: 7.5 }] },
    payouts: [{ id: 70, reference_number: null, status: 'completed', net_amount: 832500, transaction_id: null, processed_at: '2026-11-06T10:00:00Z', paid_in_period: true }],
    late_fees_outstanding: { count: 0, amount: 0 },
    snapshot: null,
    rectification: null,
  };
}

const APPELS = vi.hoisted(() => ({ releve: [] as unknown[][], historique: [] as Record<string, unknown>[] }));
const { requete, mutation } = vi.hoisted(() => ({
  requete: <T,>(data: T) => ({ data, isLoading: false, isError: false, error: null, refetch: () => undefined }),
  mutation: () => ({ mutateAsync: async () => undefined, mutate: () => undefined, isPending: false }),
}));

vi.mock('@/lib/queries/payments', () => ({
  useOwnerStatement: (...args: unknown[]) => {
    APPELS.releve.push(args);
    return requete({ data: releveDe(args[0] as string) });
  },
  usePaymentsHistory: (params: Record<string, unknown>) => {
    APPELS.historique.push(params);
    return requete({
      data: [
        {
          source: 'lease', id: 501, reference_number: null, amount: 650000, currency: 'XOF', payment_method: 'wave', payment_type: 'rent', status: 'paid',
          paid_amount: 650000, remaining_amount: 0, date: '2026-11-03', paid_at: '2026-11-03', booking_id: null, lease_id: 63, property_id: 11, customer_id: 42, created_at: null,
          property: { id: 11, title: 'Villa Almadies' }, payer: { id: 42, name: 'Awa Ndiaye' },
        },
      ],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 38, from: 1, to: 1, totals: { count: 1, amount: 650000, paid_amount: 650000, remaining_amount: 0 } },
    });
  },
  usePayouts: () =>
    requete({
      data: [
        { id: 70, reference_number: null, lease_id: 63, booking_id: null, agency_id: 3, landlord_id: 41, issued_by_id: 5, status: 'completed', period_start: '2026-10-01', period_end: '2026-10-31',
          gross_amount: 900000, commission_amount: 67500, fees_amount: 0, net_amount: 832500, currency: 'XOF', payment_method: 'bank_transfer', transaction_id: null, scheduled_at: null, processed_at: '2026-11-06T10:00:00Z', failed_reason: null, notes: null, created_at: '2026-11-05T10:00:00Z' },
      ],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 1, from: 1, to: 1 },
    }),
  useInvoices: () =>
    requete({
      data: [{ id: 88, reference_number: null, customer_id: 42, kind: 'invoice', status: 'sent', issue_date: '2026-11-01', due_date: '2026-11-15', total_amount: 25000, currency: 'XOF' }],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 1, from: 1, to: 1 },
    }),
  usePayout: (id: number | null) =>
    requete(id === null ? undefined : { data: { id, reference_number: null, landlord_id: 41, status: 'completed', period_start: '2026-10-01', period_end: '2026-10-31', gross_amount: 900000, commission_amount: 67500, fees_amount: 0, net_amount: 832500, currency: 'XOF', payment_method: 'bank_transfer', transaction_id: null, processed_at: '2026-11-06T10:00:00Z', created_at: '2026-11-05T10:00:00Z' } }),
  useInvoice: (id: number | null) =>
    requete(id === null ? undefined : { data: { id, reference_number: null, customer_id: 42, kind: 'invoice', status: 'sent', issue_date: '2026-11-01', due_date: '2026-11-15', total_amount: 25000, currency: 'XOF', items: [], credit_notes: [{ id: 91, reference_number: null, total_amount: 5000, currency: 'XOF' }] } }),
  useInvoiceSend: mutation,
  useInvoiceMarkPaid: mutation,
  useInvoiceCancel: mutation,
  usePayoutApprove: mutation,
  usePayoutCancel: mutation,
  usePayoutMarkFailed: mutation,
  usePayoutMarkProcessed: mutation,
  useBeneficiaryPayoutMethods: () => requete({ data: [] }),
}));

const rendre = () => render(withIntl(<LoyersDuBailleur />));
const sansEspaces = (s: string | null | undefined) => (s ?? '').replace(/[\s  ]/g, '');

describe('LoyersDuBailleur — la page « Loyers » du bailleur (TCK-2651)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-14T10:00:00Z'));
    ADRESSE.courante = '';
    BIENS_EN_PLUS.liste = [];
    APPELS.releve.length = 0;
    APPELS.historique.length = 0;
    ROUTEUR.replace.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('AC1 — le reste à verser est balance.remaining_to_pay, pas l’écart du mois, et ne suit pas le mois', () => {
    const { unmount } = rendre();
    const reste = screen.getByTestId('reste-a-verser');
    expect(sansEspaces(reste.textContent)).toBe('1847300F');
    // Ni l'écart du mois, ni Net − Déjà versé recomposé par l'écran.
    expect(sansEspaces(reste.textContent)).not.toContain('185000');
    expect(screen.getByText('Reste à vous verser')).toBeInTheDocument();
    const ventilation = within(document.querySelector<HTMLElement>('[data-slot="ventilation"]')!);
    expect(ventilation.queryByText('Reste à vous verser')).toBeNull();
    expect(sansEspaces(ventilation.getByText('Net du mois').nextElementSibling?.textContent)).toBe('1017500F');
    expect(sansEspaces(screen.getByTestId('prochain-versement').textContent)).toContain('15nov.');
    unmount();

    ADRESSE.courante = 'period=2026-10';
    rendre();
    expect(sansEspaces(screen.getByTestId('reste-a-verser').textContent)).toBe('1847300F');
    const octobre = within(document.querySelector<HTMLElement>('[data-slot="ventilation"]')!);
    expect(sansEspaces(octobre.getByText('Net du mois').nextElementSibling?.textContent)).toBe('832500F');
    expect(APPELS.releve.at(-1)).toEqual(['2026-10']);
  });

  it('la ventilation : commission à son taux unique, « Interventions 0 F » sans signe, le versement daté', () => {
    rendre();
    const ventilation = within(document.querySelector<HTMLElement>('[data-slot="ventilation"]')!);
    expect(ventilation.getByText('Ce qui vous revient en novembre')).toBeInTheDocument();
    expect(ventilation.getByText('Commission de gestion (7,5 %)')).toBeInTheDocument();
    expect(ventilation.getByText('Encaissé · 2 loyers sur 3')).toBeInTheDocument();
    const interventions = ventilation.getByText('Interventions').nextElementSibling?.textContent ?? '';
    expect(sansEspaces(interventions)).toBe('0F');
    expect(interventions).not.toMatch(/[-−]/);
    expect(ventilation.getByText('Déjà versé · le 6 nov.')).toBeInTheDocument();
  });

  it('AC2 — « Par bien » rend une ligne par élément de properties[], titre, locataire et retard', () => {
    rendre();
    const lignes = document.querySelectorAll<HTMLElement>('[data-slot="par-bien-liste"] [data-slot="ligne-du-bien"]');
    expect(lignes).toHaveLength(3);
    expect(within(lignes[0]!).getByText('Villa Almadies')).toBeInTheDocument();
    expect(within(lignes[0]!).getByText('Awa Ndiaye')).toBeInTheDocument();
    expect(within(lignes[0]!).getByText('Payé')).toBeInTheDocument();
    expect(within(lignes[2]!).getByText('Garage Ouest Foire')).toBeInTheDocument();
    expect(within(lignes[2]!).getByText('En retard de 6 j')).toBeInTheDocument();
    const tableau = document.querySelector<HTMLElement>('[data-slot="par-bien-tableau"] tbody')!;
    expect(tableau.querySelectorAll('tr')).toHaveLength(3);
    // Les colonnes de texte se rétrécissent (deux lignes au plus) : le texte entier reste dans le DOM et en `title`.
    const [bien, locataire] = tableau.querySelectorAll('tr')[0]!.querySelectorAll('td');
    expect(bien!.closest('td')).toHaveClass('max-w-0');
    expect(within(bien!).getByTitle('Villa Almadies')).toHaveTextContent('Villa Almadies');
    expect(within(locataire!).getByTitle('Awa Ndiaye')).toHaveClass('line-clamp-2');
  });

  it('décision 18 — un loyer échu remboursé se lit « Reçu puis remboursé », ni « Payé » ni « En retard »', () => {
    BIENS_EN_PLUS.liste = [
      { property_id: 14, title: 'F3 Mermoz', tenant_name: 'Fatou Diop', expected_rent: 300000, collected: 0, commission: 0, fees: 0, net: 0, has_movements: false, month_status: 'refunded', days_late: null },
    ];
    rendre();
    const lignes = document.querySelectorAll<HTMLElement>('[data-slot="par-bien-liste"] [data-slot="ligne-du-bien"]');
    expect(lignes).toHaveLength(4);
    expect(within(lignes[3]!).getByText('Reçu puis remboursé')).toBeInTheDocument();
    expect(within(lignes[3]!).queryByText(/Payé|En retard/)).toBeNull();
    const ligne = document.querySelectorAll<HTMLElement>('[data-slot="par-bien-tableau"] tbody tr')[3]!;
    expect(within(ligne).getByText('Reçu puis remboursé')).toBeInTheDocument();
  });

  it.each(['', 'tab=versements', 'tab=factures', 'tab=operations'])('AC3 — %s : ni « ID entité » ni « #n », détail ouvert compris', async (onglet) => {
    ADRESSE.courante = onglet;
    rendre();
    const ouvrir = screen.queryAllByRole('button', { name: /^Ouvrir|^Voir/ });
    if (ouvrir[0]) fireEvent.click(ouvrir[0]);
    await waitFor(() => expect(document.body.textContent).toBeTruthy());
    const texte = document.body.textContent ?? '';
    expect(texte).not.toMatch(/#\d+/);
    expect(texte).not.toMatch(/ID entité|Type d.entité/);
    if (onglet === 'tab=operations') {
      // Le bien et le locataire NOMMÉS, à la place de « Bail #63 ».
      expect(screen.getAllByText('Villa Almadies · Awa Ndiaye').length).toBeGreaterThan(0);
      expect(screen.getByLabelText('Bien')).toBeInTheDocument();
      expect(screen.getByLabelText('Locataire')).toBeInTheDocument();
    }
  });

  it('un ancien lien de notification (?tab=payouts) ouvre « Versements »', () => {
    ADRESSE.courante = 'tab=payouts';
    rendre();
    expect(screen.getByRole('link', { name: 'Versements' })).toHaveAttribute('aria-current', 'page');
  });

  it('AC4 — le sélecteur dit « novembre 2026 », relit period=2026-11, en change par l’adresse, sans champ natif', async () => {
    const u = userEvent.setup();
    const { container } = rendre();
    expect(APPELS.releve[0]).toEqual(['2026-11']);
    expect(container.querySelector('input[type="month"]')).toBeNull();
    const declencheurs = screen.getAllByRole('button', { name: /^Période : / });
    expect(declencheurs.some((b) => /novembre 2026/i.test(b.textContent ?? ''))).toBe(true);

    await u.click(declencheurs.find((b) => /novembre 2026/i.test(b.textContent ?? ''))!);
    await u.click(await screen.findByRole('menuitem', { name: 'Octobre 2026' }));
    expect(ROUTEUR.replace).toHaveBeenCalledWith('/app/payments?period=2026-10', { scroll: false });
  });

  it('les exports : relevé PDF et CSV de la période, attestation de l’année, avec le jeton de session', async () => {
    const fetchMock = vi.fn(async () => new Response(new Blob(['%PDF']), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    URL.createObjectURL = vi.fn(() => 'blob:releve');
    URL.revokeObjectURL = vi.fn();
    rendre();

    fireEvent.click(screen.getByRole('button', { name: 'Relevé PDF' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Télécharger le relevé en CSV' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'Attestation annuelle' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    const urls = fetchMock.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(urls[0]).toMatch(/\/owner-statements\/pdf\?period=2026-11$/);
    expect(urls[1]).toMatch(/\/owner-statements\/csv\?period=2026-11$/);
    expect(urls[2]).toMatch(/\/owner-statements\/pdf\?period=2026$/);
    expect(urls.every((url) => !url.includes('landlord_id'))).toBe(true);
    const entetes = (fetchMock.mock.calls[0] as unknown[])[1] as { headers: Record<string, string> };
    expect(entetes.headers.Authorization).toBe('Bearer jeton-de-session');
    // Au téléphone, la carte « Documents » porte les mêmes fichiers.
    const documents = within(document.querySelector<HTMLElement>('[data-slot="documents-du-releve"]')!);
    expect(documents.getByText('Relevé de novembre')).toBeInTheDocument();
    expect(documents.getByText('Attestation annuelle 2026')).toBeInTheDocument();
  });

  it('non-fuite côté écran : le relevé du LECTEUR (aucun landlord_id), le registre borné à ses opérations', () => {
    ADRESSE.courante = 'tab=operations';
    rendre();
    expect(APPELS.releve.every((args) => args.length === 1)).toBe(true);
    const registre = APPELS.historique.find((p) => p.per_page === 20);
    expect(registre).toMatchObject({ landlord_id: 41, include: ['property', 'payer'] });
  });
});
