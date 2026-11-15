/**
 * TCK-2916 (maquette `app-paiements`, approche A, e4 « Bailleur — Mes revenus ») — les revenus du bailleur
 * complets, sur les champs servis par TCK-2915 et TCK-2909 :
 *
 * - AC2 : « Prochain versement prévu le 15 nov. par virement » et le compte MASQUÉ servi ;
 * - AC3 : la règle dit le jour SERVI (`payout_rule.day`), « le 10 », « le 1er » ; rien sans règle ;
 * - AC4 : la note de relance d'un bien en retard, depuis `reminders[]` — la dernière au téléphone, chacune avec
 *   son canal au bureau ; rien pour un bien payé ;
 * - AC5 : la vignette et « Bail LS-… » de chaque ligne ;
 * - AC6 : la nature, le moyen et « Avis » (`GET /api/payouts/{id}/notice/pdf`, porteur du jeton) de chaque
 *   versement terminé au bailleur, et « Versements 3 » depuis `payouts_count`.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { OwnerStatement, OwnerStatementProperty, Payout } from '@/types/invoice';

import { LoyersDuBailleur } from '../LoyersDuBailleur';
import { PayoutDetailDialog } from '../../PayoutDetailDialog';

const ADRESSE = vi.hoisted(() => ({ courante: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/app/payments',
  useSearchParams: () => new URLSearchParams(ADRESSE.courante),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 41, roles: ['owner'] }, token: 'jeton-de-session' }) }));
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: false, isLoading: false }) }));
vi.mock('@/hooks/usePaymentProviders', () => ({ usePaymentProviders: () => ({ providers: [] }) }));
vi.mock('@/components/documents/BoutonTelechargement', () => ({ BoutonTelechargement: () => null }));

const ETAT = vi.hoisted(() => ({
  releve: {} as Partial<OwnerStatement>,
  versements: [] as Partial<Payout>[],
  versement: null as Partial<Payout> | null,
}));

function bien(surcharge: Partial<OwnerStatementProperty>): OwnerStatementProperty {
  return {
    property_id: 11,
    title: 'Villa Almadies',
    tenant_name: 'Fatou Kiné Diallo',
    expected_rent: 2_150_000,
    collected: 2_150_000,
    commission: 161_250,
    fees: 0,
    net: 1_988_750,
    has_movements: true,
    month_status: 'paid',
    days_late: null,
    lease_reference: null,
    photo_url: null,
    reminders: [],
    ...surcharge,
  } as OwnerStatementProperty;
}

function releve(): OwnerStatement {
  return {
    agency: { id: 3, name: 'Dakar Immo' },
    landlord: { id: 41, name: 'Mme Diop', company_name: null },
    period: '2026-11',
    annual: false,
    period_start: '2026-11-01',
    period_end: '2026-11-30',
    currency: 'XOF',
    totals: { gross: 2_655_000, commission: 199_125, fees: 0, net: 2_455_875, paid_out: 1_500_000 },
    balance: { remaining_to_pay: 955_875, as_of: '2026-11-14' },
    next_payout: null,
    properties: [],
    lines: { lease_payments: [] },
    payouts: [],
    late_fees_outstanding: { count: 0, amount: 0 },
    snapshot: null,
    rectification: null,
    ...ETAT.releve,
  } as unknown as OwnerStatement;
}

const { requete, mutation } = vi.hoisted(() => ({
  requete: <T,>(data: T) => ({ data, isLoading: false, isError: false, error: null, refetch: () => undefined }),
  mutation: () => ({ mutateAsync: async () => undefined, mutate: () => undefined, isPending: false }),
}));
const page = <T,>(data: T[]) => ({ data, meta: { current_page: 1, last_page: 1, per_page: 20, total: data.length, from: 1, to: data.length } });

vi.mock('@/lib/queries/payments', () => ({
  useOwnerStatement: () => requete({ data: releve() }),
  usePaymentsHistory: () => requete(page([])),
  usePayouts: () => requete(page(ETAT.versements)),
  useInvoices: () => requete(page([])),
  usePayout: (id: number | null) => requete(id === null || ETAT.versement === null ? undefined : { data: ETAT.versement }),
  useInvoice: () => requete(undefined),
  useInvoiceSend: mutation,
  useInvoiceMarkPaid: mutation,
  useInvoiceCancel: mutation,
  usePayoutApprove: mutation,
  usePayoutCancel: mutation,
  usePayoutMarkFailed: mutation,
  usePayoutMarkProcessed: mutation,
  useBeneficiaryPayoutMethods: () => requete({ data: [] }),
}));

const texte = (s: string | null | undefined) => (s ?? '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
const rendre = () => render(withIntl(<LoyersDuBailleur />));

function versement(surcharge: Partial<Payout>): Partial<Payout> {
  return {
    id: 70,
    reference_number: 'RVS-202611-01',
    landlord_id: 41,
    payee_role: 'landlord',
    nature: 'advance',
    status: 'completed',
    period_start: '2026-11-01',
    period_end: '2026-11-30',
    net_amount: 1_500_000,
    currency: 'XOF',
    payment_method: 'bank_transfer',
    scheduled_at: null,
    processed_at: '2026-11-06T10:00:00Z',
    created_at: '2026-11-06T09:00:00Z',
    ...surcharge,
  };
}

describe('LoyersDuBailleur — les revenus complets (TCK-2916)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-14T10:00:00Z'));
    ADRESSE.courante = '';
    ETAT.releve = {};
    ETAT.versements = [];
    ETAT.versement = null;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('AC2 — le prochain versement dit sa date, son moyen en clair et le compte masqué servi', () => {
    ETAT.releve = {
      next_payout: {
        id: 77, scheduled_at: '2026-11-15T09:00:00Z', payment_method: 'bank_transfer', status: 'scheduled', net_amount: 955_875,
        payout_method_kind: 'bank_transfer', payout_method_masked: '•••• 4521', payout_method_source: 'default',
      },
    };
    rendre();
    const ligne = texte(screen.getByTestId('prochain-versement').textContent);
    expect(ligne).toContain('Prochain versement prévu le 15 nov. par virement');
    expect(texte(screen.getByTestId('compte-du-versement').textContent)).toBe('•••• 4521');
  });

  it('AC2 — un portefeuille se nomme devant son numéro masqué ; sans compte servi, aucune ligne de compte', () => {
    ETAT.releve = {
      next_payout: { id: 77, scheduled_at: '2026-11-15T09:00:00Z', payment_method: 'wave', status: 'scheduled', net_amount: 1, payout_method_kind: 'wave', payout_method_masked: '•••• 2018' },
    };
    const { unmount } = rendre();
    expect(texte(screen.getByTestId('prochain-versement').textContent)).toContain('par Wave');
    expect(texte(screen.getByTestId('compte-du-versement').textContent)).toBe('Wave •••• 2018');
    unmount();

    ETAT.releve = { next_payout: { id: 77, scheduled_at: '2026-11-15T09:00:00Z', payment_method: 'cash', status: 'scheduled', net_amount: 1, payout_method_masked: null } };
    rendre();
    expect(screen.queryByTestId('compte-du-versement')).toBeNull();
  });

  it('AC3 — la règle dit le jour servi : « le 10 », « le 1er », et rien sans règle', () => {
    ETAT.releve = { payout_rule: { day: 10, source: 'mandate' } };
    const { unmount } = rendre();
    expect(texte(screen.getByTestId('regle-de-versement').textContent)).toBe(
      'Le versement part le 10 de chaque mois pour ce qui est encaissé. Un loyer reçu après cette date rejoint le versement suivant.',
    );
    unmount();

    ETAT.releve = { payout_rule: { day: 1, source: 'agency' } };
    const second = rendre();
    expect(texte(screen.getByTestId('regle-de-versement').textContent)).toContain('Le versement part le 1er de chaque mois');
    second.unmount();

    ETAT.releve = { payout_rule: { day: null, source: null } };
    rendre();
    expect(screen.queryByTestId('regle-de-versement')).toBeNull();
  });

  it('AC4 — une relance WhatsApp du 8 nov. : « relancé par Dakar Immo le 8 nov. » au téléphone, avec son canal au bureau', () => {
    ETAT.releve = {
      properties: [
        bien({ property_id: 13, title: 'Garage Ouest Foire', month_status: 'late', days_late: 6, reminders: [{ at: '2026-11-08T09:30:00Z', channel: 'whatsapp', by_name: null }] }),
      ],
    };
    rendre();
    const telephone = document.querySelector<HTMLElement>('[data-slot="relances-telephone"]');
    expect(texte(telephone?.textContent)).toBe(
      'Garage Ouest Foire : relancé par Dakar Immo le 8 nov. Son loyer s’ajoutera à votre versement dès qu’il sera encaissé.',
    );
    const bureau = document.querySelector<HTMLElement>('[data-slot="relances-bureau"]');
    expect(texte(bureau?.textContent)).toBe('Garage Ouest Foire : relancé par Dakar Immo le 8 nov. (WhatsApp).');
  });

  it('AC4 — au bureau chaque relance, dans l’ordre, avec son auteur ; au téléphone la dernière ; rien pour un bien payé', () => {
    ETAT.releve = {
      properties: [
        // L'API les sert de la plus récente à la plus ancienne.
        bien({
          property_id: 13, title: 'Garage Ouest Foire', month_status: 'late', days_late: 6,
          reminders: [
            { at: '2026-11-10T11:00:00Z', channel: 'call', by_name: 'Sokhna Sène' },
            { at: '2026-11-08T09:30:00Z', channel: 'whatsapp', by_name: null },
          ],
        }),
        bien({ property_id: 11, month_status: 'paid', reminders: [{ at: '2026-11-02T09:00:00Z', channel: 'call', by_name: 'Awa Diop' }] }),
      ],
    };
    rendre();
    expect(texte(document.querySelector('[data-slot="relances-bureau"]')?.textContent)).toBe(
      'Garage Ouest Foire : relancé par Dakar Immo le 8 nov. (WhatsApp) et le 10 nov. (appel de Sokhna Sène).',
    );
    expect(texte(document.querySelector('[data-slot="relances-telephone"]')?.textContent)).toContain('relancé par Dakar Immo le 10 nov.');
    expect(document.body.textContent).not.toContain('Villa Almadies : relancé');
  });

  it('AC4 — trois relances se joignent par « et », l’élision suit le prénom (« d’Awa », « de Yacine »)', () => {
    ETAT.releve = {
      properties: [
        bien({
          property_id: 13, title: 'Garage Ouest Foire', month_status: 'late', days_late: 9,
          reminders: [
            { at: '2026-11-12T11:00:00Z', channel: 'whatsapp', by_name: 'Yacine Ba' },
            { at: '2026-11-10T11:00:00Z', channel: 'call', by_name: 'Awa Diop' },
            { at: '2026-11-08T09:30:00Z', channel: 'whatsapp', by_name: null },
          ],
        }),
      ],
    };
    rendre();
    expect(texte(document.querySelector('[data-slot="relances-bureau"]')?.textContent)).toBe(
      'Garage Ouest Foire : relancé par Dakar Immo le 8 nov. (WhatsApp), le 10 nov. (appel d’Awa Diop) et le 12 nov. (WhatsApp de Yacine Ba).',
    );
  });

  it('AC4 — sans relance datée, aucune note', () => {
    ETAT.releve = { properties: [bien({ property_id: 13, month_status: 'late', days_late: 6, reminders: [] })] };
    rendre();
    expect(document.querySelector('[data-slot="relances-telephone"]')).toBeNull();
    expect(document.querySelector('[data-slot="relances-bureau"]')).toBeNull();
  });

  it('AC5 — chaque ligne rend sa vignette et « Bail LS-… » ; sans photo, la maison', () => {
    ETAT.releve = {
      properties: [
        bien({ property_id: 11, lease_reference: 'LS-7HQ2MZKD', photo_url: 'https://api.takussan.test/storage/11/conversions/villa-thumbnail.jpg' }),
        bien({ property_id: 12, title: 'Appartement Mermoz', lease_reference: 'LS-3RCV81TA', photo_url: null }),
      ],
    };
    rendre();
    const table = document.querySelector<HTMLElement>('[data-slot="par-bien-tableau"]') as HTMLElement;
    expect(within(table).getByText('Bail LS-7HQ2MZKD')).toBeInTheDocument();
    expect(within(table).getByText('Bail LS-3RCV81TA')).toBeInTheDocument();
    const vignettes = table.querySelectorAll<HTMLElement>('[data-slot="vignette-du-bien"]');
    expect(vignettes).toHaveLength(2);
    expect(vignettes[0]?.querySelector('img')?.getAttribute('src')).toContain(encodeURIComponent('https://api.takussan.test/storage/11/conversions/villa-thumbnail.jpg'));
    expect(vignettes[1]?.querySelector('img')).toBeNull();
    expect(vignettes[1]?.querySelector('svg')).not.toBeNull();
    // Au téléphone aussi, la photo du bien.
    const telephone = document.querySelectorAll<HTMLElement>('[data-slot="par-bien-liste"] [data-slot="vignette-du-bien"]');
    expect(telephone[0]?.querySelector('img')).not.toBeNull();
  });

  it('AC6 — « Versements 3 » depuis payouts_count ; sans compteur servi, « Versements » seul', () => {
    ETAT.releve = { payouts_count: 3 };
    const { unmount } = rendre();
    expect(screen.getByRole('link', { name: 'Versements (3)' })).toBeInTheDocument();
    expect(texte(document.querySelector('[data-slot="compte-de-l-onglet"]')?.textContent)).toBe('3');
    unmount();

    ETAT.releve = {};
    rendre();
    expect(screen.getByRole('link', { name: 'Versements' })).toBeInTheDocument();
  });

  it('AC6 — chaque versement dit sa nature, son moyen, sa référence ; « Avis » télécharge l’avis avec le jeton', async () => {
    ETAT.versements = [
      versement({}),
      versement({ id: 71, reference_number: 'RVS-202610-02', nature: 'balance', period_start: '2026-10-01', processed_at: '2026-10-15T10:00:00Z' }),
      versement({ id: 72, reference_number: 'RVS-202611-02', nature: null, status: 'scheduled', processed_at: null, scheduled_at: '2026-11-15T09:00:00Z' }),
    ];
    const fetchSimule = vi.fn(async () => new Response(new Blob(['%PDF']), { status: 200 }));
    vi.stubGlobal('fetch', fetchSimule);
    const createObjectURL = vi.fn(() => 'blob:avis');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    rendre();

    const lignes = document.querySelectorAll<HTMLElement>('[data-slot="derniers-versements"] [data-slot="versement"]');
    expect(lignes).toHaveLength(3);
    expect(texte(lignes[0]?.textContent)).toContain('Acompte de novembre');
    expect(texte(lignes[0]?.textContent)).toContain('Virement bancaire · RVS-202611-01');
    expect(texte(lignes[1]?.textContent)).toContain('Solde d’octobre');
    // Un versement non terminé n'a pas d'avis : l'API le refuserait (422).
    expect(within(lignes[2] as HTMLElement).queryByRole('button', { name: /avis/i })).toBeNull();

    fireEvent.click(within(lignes[0] as HTMLElement).getByRole('button', { name: 'Télécharger l’avis du versement du 6 nov.' }));
    await waitFor(() => expect(fetchSimule).toHaveBeenCalledTimes(1));
    const [url, init] = fetchSimule.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/payouts\/70\/notice\/pdf$/);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jeton-de-session');
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
  });

  it('AC6 — l’avis d’une restitution au locataire ne se propose pas', () => {
    ETAT.versements = [versement({ id: 73, payee_role: 'tenant', nature: 'deposit_refund' })];
    rendre();
    const ligne = document.querySelector<HTMLElement>('[data-slot="derniers-versements"] [data-slot="versement"]') as HTMLElement;
    expect(texte(ligne.textContent)).toContain('Restitution de caution');
    expect(within(ligne).queryByRole('button', { name: /avis/i })).toBeNull();
  });

  it('AC6 — le détail d’un versement terminé (onglet Versements) porte « Avis de versement (PDF) »', async () => {
    ETAT.versement = versement({}) as Payout;
    const fetchSimule = vi.fn(async () => new Response(new Blob(['%PDF']), { status: 200 }));
    vi.stubGlobal('fetch', fetchSimule);
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:avis'), revokeObjectURL: vi.fn() }));
    render(withIntl(<PayoutDetailDialog payoutId={70} onClose={() => undefined} sansIdentifiants />));
    fireEvent.click(await screen.findByRole('button', { name: 'Avis de versement (PDF)' }));
    await waitFor(() => expect(fetchSimule).toHaveBeenCalledTimes(1));
    expect((fetchSimule.mock.calls[0] as unknown as [string])[0]).toMatch(/\/api\/payouts\/70\/notice\/pdf$/);
  });

  it('AC6 — le détail d’un versement planifié n’a pas d’avis', () => {
    ETAT.versement = versement({ status: 'scheduled', processed_at: null }) as Payout;
    render(withIntl(<PayoutDetailDialog payoutId={70} onClose={() => undefined} sansIdentifiants />));
    expect(screen.queryByRole('button', { name: 'Avis de versement (PDF)' })).toBeNull();
  });
});
