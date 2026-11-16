/**
 * TCK-2922 — les gestes EN LIGNE du point du mois au bureau (maquette `app-argent`, approche A, e0) :
 * « Relancer » sur chaque impayé de « À faire · impayés les plus anciens », « Refuser » / « Approuver »
 * sur chaque reversement à approuver.
 *
 * Le réseau est un faux serveur derrière `apiRequest` : chaque requête est relevée. La relance passe par
 * la vraie feuille de l'écran Impayés (`FeuilleDeRelance`) et la vraie action serveur du message.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createTranslator } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import { withIntl } from '@/test/intl';
import type { PaymentHistoryRow, Payout } from '@/types/invoice';

import type { ContexteDuPoint } from '../PointDuMois';
import type { GestesDeLArgent } from '../gestes';

const DICTIONNAIRES = { fr, en, wo } as const;
const LIEN = 'https://www.takussan.com/pay/k7Qm2xR9';

const reseau = vi.hoisted(() => ({ appels: [] as { chemin: string; methode: string; corps: unknown }[], refus: new Set<string>() }));
const etat = vi.hoisted(() => ({ reversements: [] as unknown[], lignes: [] as unknown[] }));

vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));
vi.mock('next-intl/server', () => ({
  getTranslations: async ({ locale, namespace }: { locale: keyof typeof DICTIONNAIRES; namespace: string }) =>
    createTranslator({ locale, messages: DICTIONNAIRES[locale], namespace: namespace as never }),
}));
vi.mock('@/context/AuthContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/context/AuthContext')>()),
  useAuth: () => ({ token: 'jeton', user: { id: 9, agency_id: 1 } }),
}));
vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => ({
    data: { data: [{ id: 'agent:1', agency: { id: 1, name: 'Keur Immo', slug: 'keur-immo' } }], meta: { active_profile_id: 'agent:1', count: 1 } },
    isLoading: false,
  }),
}));

vi.mock('@/lib/api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...reel,
    apiRequest: async (chemin: string, options: { method?: string; body?: unknown } = {}) => {
      const methode = options.method ?? 'GET';
      reseau.appels.push({ chemin, methode, corps: options.body });
      const url = new URL(chemin, 'http://api.test');
      const page = (data: unknown[]) => ({ data, meta: { current_page: 1, last_page: 1, per_page: 20, total: data.length, totals: { count: 0, amount: 0, paid_amount: 0, remaining_amount: 0 } } });
      if (url.pathname === '/api/payments/history') {
        return page(url.searchParams.get('filter[days_late_min]') ? etat.lignes : []);
      }
      if (url.pathname === '/api/payouts') return page(etat.reversements);
      const geste = /^\/api\/payouts\/(\d+)\/(approve|cancel)$/.exec(url.pathname);
      if (geste && methode === 'POST') {
        if (reseau.refus.has(`${geste[2]}:${geste[1]}`)) throw new reel.ApiError(422, { message: 'Refusé par le serveur.' });
        // Le geste a abouti : la file relue ne le porte plus.
        etat.reversements = etat.reversements.filter((p) => (p as Payout).id !== Number(geste[1]));
        return { data: { id: Number(geste[1]), status: geste[2] === 'approve' ? 'pending' : 'cancelled' } };
      }
      if (/^\/api\/lease-payments\/\d+\/payment-link$/.test(url.pathname) && methode === 'POST') return { data: { url: LIEN, expires_at: null } };
      const relances = /^\/api\/lease-payments\/(\d+)\/reminders$/.exec(url.pathname);
      if (relances && methode === 'POST') {
        if (reseau.refus.has(`note:${relances[1]}`)) throw new reel.ApiError(500, {});
        return { data: { id: 1, at: new Date().toISOString(), source: 'manual', channel: 'whatsapp', by: { id: 9, name: 'Sokhna Sène' }, note: null, milestone: null } };
      }
      throw new Error(`requête inattendue : ${methode} ${chemin}`);
    },
  };
});

const { AFaireEtDerniers } = await import('../PointDuMois');

function ligne(id: number, extra: Partial<PaymentHistoryRow> = {}): PaymentHistoryRow {
  return {
    source: 'lease',
    id,
    reference_number: `LP-${id}`,
    amount: 250_000,
    currency: 'XOF',
    payment_method: null,
    payment_type: 'rent',
    status: 'late',
    paid_amount: 0,
    remaining_amount: 250_000,
    amount_due: 250_000,
    date: '2026-10-01T00:00:00Z',
    paid_at: null,
    period_start: '2026-10-01',
    period_end: '2026-10-31',
    due_date: '2026-10-07',
    booking_id: null,
    lease_id: 100 + id,
    property_id: 200 + id,
    customer_id: 300 + id,
    created_at: '2026-09-01T00:00:00Z',
    days_late: 34,
    payer: { id: 300 + id, name: `Locataire ${id}`, phone: '+221771234567', first_name: `Prénom${id}`, locale: null },
    property: { id: 200 + id, title: `Studio ${id}`, reference_number: null },
    landlord: { id: 50, name: 'Mme Seck' },
    last_reminder: { at: '2026-11-02T10:00:00Z', source: 'manual', channel: 'whatsapp', by: { id: 9, name: 'Sokhna Sène' } },
    reminders_count: 1,
    ...extra,
  } as PaymentHistoryRow;
}

function reversement(id: number, extra: Partial<Payout> = {}): Payout {
  return {
    id,
    reference_number: `PO-${id}`,
    status: 'awaiting_approval',
    net_amount: 1_400_000,
    currency: 'XOF',
    period_start: '2026-10-01',
    issued_by_id: 3,
    issuer: { id: 3, name: 'Ibou Fall' },
    payee_role: 'landlord',
    payout_method_masked: '77 *** 12',
    ...extra,
  } as Payout;
}

let gestes: GestesDeLArgent;

function rendre() {
  const ctx: ContexteDuPoint = {
    mois: '2026-11',
    periodeDansLUrl: null,
    synthese: {
      period: '2026-11',
      as_of: '2026-11-11',
      currency: 'XOF',
      collected: { amount: 1, count: 1, previous_amount: 1 },
      overdue: { amount: 1, count: 1, leases_count: 1, never_reminded_count: 0, by_age: { under_8: { amount: 0, count: 0 }, from_8_to_30: { amount: 0, count: 0 }, over_30: { amount: 1, count: 1 } } },
      deposits_held: 0,
      payouts_awaiting_approval: { amount: 1_400_000, count: etat.reversements.length, landlords_count: 1 },
      payouts_pending: { amount: 0, count: 0 },
      payouts_open: { amount: 0, count: 0, landlords_count: 0 },
      invoices_draft: { amount: 0, count: 0 },
    },
    syntheseEnCours: false,
    syntheseRefusee: false,
    gestes,
    rapprochement: false,
    lienExport: null,
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utilisateur = userEvent.setup();
  render(withIntl(<QueryClientProvider client={client}><AFaireEtDerniers {...ctx} /></QueryClientProvider>));
  return utilisateur;
}

type FausseFenetre = { opener: unknown; location: { href: string }; close: () => void };

beforeEach(() => {
  reseau.appels.length = 0;
  reseau.refus.clear();
  etat.reversements = [];
  etat.lignes = [];
  gestes = {
    emetFacture: true,
    emetReversement: true,
    peutApprouver: true,
    peutPayerLesPrestataires: true,
    peutAnnulerUnReversement: true,
    capacitesEnCours: false,
    canEmit: true,
    nouvelleFacture: vi.fn(),
    nouveauReversement: vi.fn(),
    ouvrirFacture: vi.fn(),
    ouvrirReversement: vi.fn(),
  };
  vi.spyOn(window, 'open').mockImplementation(() => ({ opener: {}, location: { href: '' }, close: () => {} }) as FausseFenetre as unknown as Window);
});
afterEach(() => {
  vi.mocked(window.open).mockRestore();
});

const postes = (fin: string) => reseau.appels.filter((a) => a.methode === 'POST' && a.chemin.endsWith(fin));

describe('TCK-2922 — « Relancer » sur chaque impayé de « À faire »', () => {
  it('AC1 — chaque ligne porte « Relancer », qui ouvre la relance de CETTE échéance ; après l’envoi, la ligne dit « relancé à l’instant »', async () => {
    etat.lignes = [ligne(1), ligne(2, { amount_due: 480_000, remaining_amount: 480_000 })];
    const utilisateur = rendre();

    const carte = (await screen.findByText('À faire · impayés les plus anciens')).closest('[data-slot="card"]') as HTMLElement;
    expect(within(carte).getByRole('button', { name: 'Relancer Locataire 1' })).toBeInTheDocument();
    await utilisateur.click(within(carte).getByRole('button', { name: 'Relancer Locataire 2' }));

    // La relance de l'écran Impayés : « Relancer {nom} », le montant de la ligne, le message, « Ouvrir WhatsApp ».
    const feuille = await screen.findByRole('dialog', { name: 'Relancer Locataire 2' });
    expect(within(feuille).getAllByText(/480\s?000/).length).toBeGreaterThan(0);
    expect(await within(feuille).findByText(/\[lien de paiement ajouté à l’envoi\]/)).toBeInTheDocument();

    await utilisateur.click(within(feuille).getByRole('button', { name: /Ouvrir WhatsApp/ }));

    await waitFor(() => expect(postes('/reminders').map((a) => a.chemin)).toEqual(['/api/lease-payments/2/reminders']));
    expect(postes('/payment-link').map((a) => a.chemin)).toEqual(['/api/lease-payments/2/payment-link']);
    const ligneRelancee = within(carte).getByRole('button', { name: 'Relancer Locataire 2' }).closest('li') as HTMLElement;
    await waitFor(() => expect(within(ligneRelancee).getByText('relancé à l’instant')).toBeInTheDocument());
    // L'autre ligne garde sa dernière relance.
    const autre = within(carte).getByRole('button', { name: 'Relancer Locataire 1' }).closest('li') as HTMLElement;
    expect(within(autre).queryByText('relancé à l’instant')).not.toBeInTheDocument();
  });

  it('une note refusée par le serveur ne dit pas « relancé à l’instant »', async () => {
    etat.lignes = [ligne(1, { last_reminder: null })];
    reseau.refus.add('note:1');
    const utilisateur = rendre();

    await utilisateur.click(await screen.findByRole('button', { name: 'Relancer Locataire 1' }));
    const feuille = await screen.findByRole('dialog', { name: 'Relancer Locataire 1' });
    await within(feuille).findByText(/\[lien de paiement ajouté à l’envoi\]/);
    await utilisateur.click(within(feuille).getByRole('button', { name: /Ouvrir WhatsApp/ }));

    await waitFor(() => expect(postes('/reminders')).toHaveLength(1));
    const ligneDuLocataire = screen.getByRole('button', { name: 'Relancer Locataire 1' }).closest('li') as HTMLElement;
    await waitFor(() => expect(within(ligneDuLocataire).getByText('jamais relancé')).toBeInTheDocument());
    expect(within(ligneDuLocataire).queryByText('relancé à l’instant')).not.toBeInTheDocument();
  });
});

describe('TCK-2922 — « Approuver » / « Refuser » en ligne', () => {
  it('AC2 — « Approuver » appelle POST /api/payouts/{id}/approve (sans changer la destination prévue), puis la ligne part', async () => {
    etat.reversements = [reversement(77), reversement(78)];
    const utilisateur = rendre();

    await utilisateur.click(await screen.findByRole('button', { name: 'Approuver le reversement PO-77' }));

    await waitFor(() => expect(postes('/approve').map((a) => a.chemin)).toEqual(['/api/payouts/77/approve']));
    expect(postes('/approve')[0].corps).toBeUndefined();
    await waitFor(() => expect(screen.queryByText('PO-77')).not.toBeInTheDocument());
    expect(screen.getByText('PO-78')).toBeInTheDocument();
    expect(gestes.ouvrirReversement).not.toHaveBeenCalled();
  });

  it('un refus du serveur reste dit sur la ligne, qui ne part pas', async () => {
    etat.reversements = [reversement(77)];
    reseau.refus.add('approve:77');
    const utilisateur = rendre();

    await utilisateur.click(await screen.findByRole('button', { name: 'Approuver le reversement PO-77' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Refusé par le serveur.');
    expect(screen.getByText('PO-77')).toBeInTheDocument();
  });

  it('sans destination prévue, « Approuver » ouvre le détail (qui la fait choisir) au lieu d’approuver sans', async () => {
    etat.reversements = [reversement(77, { payout_method_masked: null })];
    const utilisateur = rendre();

    await utilisateur.click(await screen.findByRole('button', { name: 'Approuver le reversement PO-77' }));
    expect(gestes.ouvrirReversement).toHaveBeenCalledWith(77);
    expect(postes('/approve')).toEqual([]);
  });

  it('les quatre yeux — celui qui a préparé le reversement ne peut pas l’approuver en ligne', async () => {
    etat.reversements = [reversement(77, { issued_by_id: 9, issuer: { id: 9, name: 'Moi' } })];
    rendre();

    const bouton = await screen.findByRole('button', { name: 'Approuver le reversement PO-77' });
    expect(bouton).toBeDisabled();
    expect(bouton).toHaveAccessibleDescription(/un autre membre doit l'approuver/);
  });

  it('AC2 — « Refuser » demande un motif, puis appelle POST /api/payouts/{id}/cancel avec ce motif ; la ligne part', async () => {
    etat.reversements = [reversement(77)];
    const utilisateur = rendre();

    await utilisateur.click(await screen.findByRole('button', { name: 'Refuser le reversement PO-77' }));
    const dialogue = await screen.findByRole('dialog', { name: 'Refuser le reversement PO-77' });
    const confirmer = within(dialogue).getByRole('button', { name: 'Refuser le reversement' });
    // Sans motif, rien ne part.
    expect(confirmer).toBeDisabled();
    await utilisateur.type(within(dialogue).getByLabelText(/Motif du refus/), '  Montant à revoir  ');
    await utilisateur.click(confirmer);

    await waitFor(() => expect(postes('/cancel').map((a) => [a.chemin, a.corps])).toEqual([['/api/payouts/77/cancel', { reason: 'Montant à revoir' }]]));
    await waitFor(() => expect(screen.queryByText('PO-77')).not.toBeInTheDocument());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('« Examiner » ouvre toujours le détail', async () => {
    etat.reversements = [reversement(77)];
    const utilisateur = rendre();

    await utilisateur.click(await screen.findByRole('button', { name: 'Examiner le reversement PO-77' }));
    expect(gestes.ouvrirReversement).toHaveBeenCalledWith(77);
  });

  it('AC2 — sans payouts.approve : ni la file, ni « Approuver », ni « Refuser »', async () => {
    gestes = { ...gestes, peutApprouver: false };
    etat.reversements = [reversement(77)];
    etat.lignes = [ligne(1)];
    rendre();

    expect(await screen.findByRole('button', { name: 'Relancer Locataire 1' })).toBeInTheDocument();
    expect(reseau.appels.some((a) => a.chemin.startsWith('/api/payouts'))).toBe(false);
    expect(screen.queryByRole('button', { name: /Approuver|Refuser/ })).not.toBeInTheDocument();
  });

  it('sans payouts.create (l’annulation, `PayoutPolicy::update`), « Refuser » n’est pas proposé ; « Approuver » reste', async () => {
    gestes = { ...gestes, peutAnnulerUnReversement: false };
    etat.reversements = [reversement(77)];
    rendre();

    expect(await screen.findByRole('button', { name: 'Approuver le reversement PO-77' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refuser le reversement PO-77' })).not.toBeInTheDocument();
  });
});
