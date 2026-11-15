/**
 * TCK-2916 (maquette `app-paiements`, approche A, e0 et e2) — « Tout télécharger » de l'historique du
 * locataire : toutes ses quittances en UNE archive servie par l'API (`receipts:all`, TCK-2915), jamais un ZIP
 * bâti dans le navigateur.
 *
 * - AC1 : le titre « Historique » porte « Tout télécharger » (téléphone) et « Tout télécharger (.zip) »
 *   (bureau) ; le geste demande l'archive `receipts:all`, avec le jeton, et le téléchargement démarre.
 * - Au-delà de ce que l'API bâtit pendant la requête (422 `document.archive_too_large`), l'archive PRÉPARÉE :
 *   demandée (`POST`, `folder: receipts:all`), et l'état « se prépare » s'affiche ; prête, elle se télécharge.
 * - Sans quittance (422 `document.archive_empty`) : un message lisible, jamais la prose du serveur.
 * - Un client sans bail (acheteur) ou sans historique n'a pas le geste ; il ne dépend pas de la page affichée.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { ArchivePreparee } from '@/lib/documents/coffre';
import type { PaymentHistoryRow, ResumeDuLoyer } from '@/types/invoice';

import { CustomerPayments } from '../CustomerPayments';

const usePaymentsHistory = vi.fn();
const useResumeDuLoyer = vi.fn();
vi.mock('@/lib/queries/payments', () => ({
  usePaymentsHistory: (...args: unknown[]) => usePaymentsHistory(...args),
  useResumeDuLoyer: () => useResumeDuLoyer(),
}));
vi.mock('@/hooks/useInitiatePayment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useInitiatePayment')>()),
  useInitiatePayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  readProviderPreference: () => null,
  rememberProviderPreference: vi.fn(),
}));
vi.mock('@/hooks/usePaymentProviders', () => ({ usePaymentProviders: () => ({ providers: ['wave'], isLoading: false }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('') }));
vi.mock('@/components/documents/BoutonTelechargement', () => ({ BoutonTelechargement: () => null }));

const COFFRE = vi.hoisted(() => ({
  preparees: [] as ArchivePreparee[],
  apresRelecture: null as ArchivePreparee[] | null,
  mutate: vi.fn(),
  isPending: false,
}));
vi.mock('@/lib/queries/coffre', () => ({
  useArchivesPreparees: () => ({
    data: { data: COFFRE.preparees },
    refetch: async () => {
      if (COFFRE.apresRelecture !== null) COFFRE.preparees = COFFRE.apresRelecture;
      return { data: { data: COFFRE.preparees } };
    },
  }),
  useDemanderLArchive: () => ({ mutate: COFFRE.mutate, isPending: COFFRE.isPending }),
}));

function ligne(surcharge: Partial<PaymentHistoryRow>): PaymentHistoryRow {
  return {
    source: 'lease', id: 24, reference_number: 'LPY-PQLJDO', amount: 1_355_000, currency: 'XOF', payment_method: null, payment_type: 'rent', status: 'paid',
    paid_amount: 1_355_000, remaining_amount: 0, late_fee_amount: null, late_fee_outstanding: 0, late_fee_payable_online: false, amount_due: 0,
    date: '2026-10-01T00:00:00Z', paid_at: '2026-10-05T00:00:00Z', period_start: '2026-10-01', period_end: '2026-10-31', due_date: '2026-10-05',
    booking_id: null, lease_id: 9, property_id: 3, customer_id: 4, created_at: '2026-10-01T00:00:00Z',
    ...surcharge,
  };
}

const A_JOUR = {
  currency: 'XOF',
  total_due: 0,
  parts: { payable_online: 0, payable_at_agency: 0 },
  items: [],
  next_rent: { lease_id: 9, lease_payment_id: 30, due_date: '2026-12-05', amount: 1_355_000, charges_amount: 0, currency: 'XOF', payable_online: true },
  schedule_state: 'up_to_date',
  lease: { id: 9, reference_number: 'LS-0DPA75TK', status: 'active', monthly_rent: 1_355_000, monthly_charges: null, currency: 'XOF', property: { id: 3, title: 'Villa 4 chambres' }, agency: { id: 2, name: 'Dakar Immo', phone: '+221776452018' } },
  offline_payment: { agency_phone: '+221776452018' },
} as unknown as ResumeDuLoyer;

function reponse(data: PaymentHistoryRow[]) {
  return { data: { data, meta: { current_page: 1, last_page: 1, per_page: 20, total: data.length } }, isLoading: false, isError: false, refetch: vi.fn() };
}

function poser(resume: ResumeDuLoyer | null, historique: PaymentHistoryRow[] = [ligne({})]) {
  useResumeDuLoyer.mockReturnValue({ data: resume ? { data: resume } : undefined, isLoading: false, isError: false });
  usePaymentsHistory.mockImplementation((params: { status?: string }) => (params.status ? reponse([]) : reponse(historique)));
}

const createObjectURL = vi.fn(() => 'blob:archive');
const json = (corps: unknown, status: number) => new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
const rendre = () => render(withIntl(<CustomerPayments />));
const bouton = () => screen.getByTestId('tout-telecharger-les-quittances');

describe('CustomerPayments — « Tout télécharger » les quittances (TCK-2916)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-14T10:00:00Z'));
    COFFRE.preparees = [];
    COFFRE.apresRelecture = null;
    COFFRE.mutate.mockReset();
    COFFRE.isPending = false;
    createObjectURL.mockClear();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('AC1 — le titre « Historique » porte « Tout télécharger » (téléphone) et « Tout télécharger (.zip) » (bureau)', () => {
    poser(A_JOUR);
    rendre();
    const titre = screen.getByRole('heading', { name: 'Historique' });
    expect(titre.parentElement?.contains(bouton())).toBe(true);
    expect(bouton().querySelector('.lg\\:hidden')?.textContent).toBe('Tout télécharger');
    expect(bouton().querySelector('.lg\\:inline')?.textContent).toBe('Tout télécharger (.zip)');
    expect(bouton()).toHaveAccessibleName('Télécharger toutes vos quittances en une archive (.zip)');
  });

  it('AC1 — le geste demande l’archive receipts:all avec le jeton, et le téléchargement démarre', async () => {
    poser(A_JOUR);
    const fetchSimule = vi.fn(async () => new Response(new Blob(['PK']), { status: 200 }));
    vi.stubGlobal('fetch', fetchSimule);
    rendre();
    fireEvent.click(bouton());
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    const [url, init] = fetchSimule.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/me\/document-vault\/archive\?folder=receipts%3Aall$/);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jeton');
    expect(COFFRE.mutate).not.toHaveBeenCalled();
  });

  it('au-delà de l’archive directe (422 archive_too_large), l’archive préparée est demandée et se dit en préparation', async () => {
    poser(A_JOUR);
    vi.stubGlobal('fetch', vi.fn(async () => json({ code: 'document.archive_too_large', message: '…' }, 422)));
    const { rerender } = rendre();
    fireEvent.click(bouton());
    await waitFor(() => expect(COFFRE.mutate).toHaveBeenCalledTimes(1));
    expect((COFFRE.mutate.mock.calls[0] as unknown[])[0]).toEqual({ folder: 'receipts:all' });
    expect(createObjectURL).not.toHaveBeenCalled();

    // La préparation est en cours : le bouton le dit, et la note aussi.
    COFFRE.preparees = [{ id: 'a1', folder: 'receipts:all', status: 'pending', error_code: null, entries_count: null, expires_at: null, created_at: null, download_path: null }];
    rerender(withIntl(<CustomerPayments />));
    expect(bouton()).toBeDisabled();
    expect(screen.getByTestId('note-de-l-archive-des-quittances')).toHaveTextContent('l’archive se prépare');
  });

  it('une archive préparée PRÊTE se télécharge par son lien, sans nouvelle demande', async () => {
    poser(A_JOUR);
    COFFRE.preparees = [
      { id: 'a1', folder: 'receipts:all', status: 'ready', error_code: null, entries_count: 64, expires_at: '2026-11-15T10:00:00Z', created_at: null, download_path: '/api/me/document-vault/archives/a1/download?signature=x' },
    ];
    const fetchSimule = vi.fn(async () => new Response(new Blob(['PK']), { status: 200 }));
    vi.stubGlobal('fetch', fetchSimule);
    rendre();
    expect(bouton().querySelector('.lg\\:hidden')?.textContent).toBe('Télécharger l’archive');
    fireEvent.click(bouton());
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    expect((fetchSimule.mock.calls[0] as unknown as [string])[0]).toMatch(/\/api\/me\/document-vault\/archives\/a1\/download\?signature=x$/);
    expect(COFFRE.mutate).not.toHaveBeenCalled();
  });

  it('trop grande, mais une préparation déjà prête à la relecture : elle se télécharge, sans nouvelle demande', async () => {
    poser(A_JOUR);
    COFFRE.apresRelecture = [
      { id: 'a2', folder: 'receipts:all', status: 'ready', error_code: null, entries_count: 64, expires_at: null, created_at: null, download_path: '/api/me/document-vault/archives/a2/download?signature=y' },
    ];
    const fetchSimule = vi
      .fn()
      .mockResolvedValueOnce(json({ code: 'document.archive_too_large', message: '…' }, 422))
      .mockResolvedValueOnce(new Response(new Blob(['PK']), { status: 200 }));
    vi.stubGlobal('fetch', fetchSimule);
    rendre();
    fireEvent.click(bouton());
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    expect((fetchSimule.mock.calls[1] as unknown as [string])[0]).toMatch(/archives\/a2\/download\?signature=y$/);
    expect(COFFRE.mutate).not.toHaveBeenCalled();
  });

  it('sans quittance (422 archive_empty), un message lisible', async () => {
    poser(A_JOUR);
    vi.stubGlobal('fetch', vi.fn(async () => json({ code: 'document.archive_empty', message: 'prose du serveur' }, 422)));
    rendre();
    fireEvent.click(bouton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Aucune quittance à réunir pour l’instant.');
    expect(COFFRE.mutate).not.toHaveBeenCalled();
  });

  it('un client sans bail, ou au bail sans historique, n’a pas le geste ; une page sans ligne payée ne le cache pas', () => {
    poser(null, [ligne({ source: 'booking', lease_id: null, payment_type: null })]);
    const premier = rendre();
    expect(screen.queryByTestId('tout-telecharger-les-quittances')).toBeNull();
    premier.unmount();

    poser(A_JOUR, []);
    const second = rendre();
    expect(screen.queryByTestId('tout-telecharger-les-quittances')).toBeNull();
    second.unmount();

    // Une page d'échéances encore dues (les payées sont plus loin) : le geste reste, il ne dépend pas de la page.
    poser(A_JOUR, [ligne({ status: 'pending', paid_at: null })]);
    rendre();
    expect(screen.getByTestId('tout-telecharger-les-quittances')).toBeInTheDocument();
  });
});
