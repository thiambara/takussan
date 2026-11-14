/**
 * TCK-2660 (vérification du 2026-11-12) — trois gardes que la vérification a trouvées VERTES sous
 * mutation (F7, F9, F10), et une quatrième (F11) :
 *
 * - F9 : les « Échéances dues » du dossier sont celles du SEUL locataire (`filter[payer_id]`) ;
 *   sans lui, le dossier d'un locataire listait les échéances en retard de toute l'agence.
 * - F10 : « Appeler » du dossier (bureau) NOTE la relance (`call`) ; une échéance payée, non.
 * - F7 : le lien de paiement (un POST) ne part qu'à l'ouverture de la relance ou du dossier,
 *   jamais au rendu de la liste ni d'une relance montée fermée.
 * - F11 : les trois comptes des tranches sont des lectures légères, sans `include`.
 *
 * Même faux serveur que `impayes.tck-2660.test.tsx`, qui honore ici `filter[payer_id]`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createTranslator } from 'next-intl';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import { withIntl } from '@/test/intl';
import type { PaymentHistoryRow } from '@/types/invoice';

const DICTIONNAIRES = { fr, en, wo } as const;
const AUJOURDHUI = new Date().toISOString().slice(0, 10);
const LIEN = 'https://www.takussan.com/pay/k7Qm2xR9';

const reseau = vi.hoisted(() => ({ appels: [] as { chemin: string; methode: string; corps: unknown }[], refus: new Set<string>() }));
const toastAdd = vi.hoisted(() => vi.fn());

vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: toastAdd }) }));

vi.mock('next-intl/server', () => ({
  getTranslations: async ({ locale, namespace }: { locale: keyof typeof DICTIONNAIRES; namespace: string }) =>
    createTranslator({ locale, messages: DICTIONNAIRES[locale], namespace: namespace as never }),
}));
vi.mock('@/context/AuthContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/context/AuthContext')>()),
  useAuth: () => ({ token: 'jeton', user: { id: 9, agency_id: 1 } }),
}));
vi.mock('@/components/leases/LeasePaymentDialog', () => ({
  LeasePaymentDialog: ({ onEncaisse, paiementInitial }: { onEncaisse?: (id: number) => void; paiementInitial?: number }) => (
    <button type="button" onClick={() => onEncaisse?.(paiementInitial ?? 0)}>
      simuler l’encaissement
    </button>
  ),
}));

function ligne(id: number, jours: number, extra: Partial<PaymentHistoryRow> = {}): PaymentHistoryRow {
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
    late_fee_amount: null,
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
    days_late: jours,
    payer: { id: 300 + id, name: `Locataire ${id}`, phone: '+221771234567', first_name: `Prénom${id}`, locale: null },
    property: { id: 200 + id, title: `Studio ${id}`, reference_number: null },
    landlord: { id: 50, name: 'Mme Seck' },
    last_reminder: null,
    reminders_count: 0,
    ...extra,
  } as PaymentHistoryRow;
}

let lignes: PaymentHistoryRow[] = [];

vi.mock('@/lib/api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...reel,
    apiRequest: async (chemin: string, options: { method?: string; body?: unknown } = {}) => {
      const methode = options.method ?? 'GET';
      reseau.appels.push({ chemin, methode, corps: options.body });
      const url = new URL(chemin, 'http://api.test');
      if (url.pathname === '/api/payments/history') {
        const min = Number(url.searchParams.get('filter[days_late_min]') ?? 0);
        const max = Number(url.searchParams.get('filter[days_late_max]') ?? Infinity);
        if (reseau.refus.has(`history:${min}-${url.searchParams.get('filter[days_late_max]') ?? ''}`)) throw new reel.ApiError(500, {});
        const page = Number(url.searchParams.get('page') ?? 1);
        const parPage = Number(url.searchParams.get('per_page') ?? 20);
        const payeur = url.searchParams.get('filter[payer_id]');
        const tri = lignes.filter(
          (l) => (l.days_late ?? 0) >= min && (l.days_late ?? 0) <= max && l.status !== 'paid' && (payeur === null || String(l.payer?.id) === payeur),
        );
        return {
          data: tri.slice((page - 1) * parPage, page * parPage),
          meta: {
            current_page: page,
            last_page: Math.max(1, Math.ceil(tri.length / parPage)),
            per_page: parPage,
            total: tri.length,
            from: 1,
            to: 1,
            totals: { count: tri.length, amount: 0, paid_amount: 0, remaining_amount: tri.reduce((s, l) => s + l.remaining_amount, 0) },
          },
        };
      }
      if (url.pathname === '/api/agencies/1/finance/aging') {
        return {
          data: {
            group_by: url.searchParams.get('group_by'),
            buckets: { '1_30': { count: 1, amount: 1 }, '31_60': { count: 0, amount: 0 }, '61_90': { count: 0, amount: 0 }, '90_plus': { count: 0, amount: 0 } },
            total: { count: lignes.length, amount: 33_715_000 },
            rows:
              url.searchParams.get('group_by') === 'tenant'
                ? [{ id: 301, name: 'Locataire 1', buckets: { '1_30': { count: 0, amount: 0 }, '31_60': { count: 1, amount: 250_000 }, '61_90': { count: 0, amount: 0 }, '90_plus': { count: 0, amount: 0 } }, total: { count: 1, amount: 250_000 } }]
                : [{ id: 50, name: 'Mme Seck', buckets: { '1_30': { count: 1, amount: 1 }, '31_60': { count: 0, amount: 0 }, '61_90': { count: 0, amount: 0 }, '90_plus': { count: 0, amount: 0 } }, total: { count: 1, amount: 1 } }],
            deposits_held: { total: 235_035_000, by_landlord: [] },
          },
        };
      }
      const lien = /^\/api\/lease-payments\/(\d+)\/payment-link$/.exec(url.pathname);
      if (lien && methode === 'POST') {
        if (reseau.refus.has(`lien:${lien[1]}`)) throw new reel.ApiError(409, { code: 'payment.not_payable' });
        return { data: { url: LIEN, expires_at: null } };
      }
      const relances = /^\/api\/lease-payments\/(\d+)\/reminders$/.exec(url.pathname);
      if (relances && methode === 'POST') {
        if (reseau.refus.has(`note:${relances[1]}`)) throw new reel.ApiError(500, {});
        return { data: { id: 1, at: `${AUJOURDHUI}T09:00:00Z`, source: 'manual', channel: (options.body as { channel: string }).channel, by: { id: 9, name: 'Sokhna Sène' }, note: null, milestone: null } };
      }
      if (relances) {
        return { data: [{ at: '2026-11-03T18:02:00Z', source: 'manual', channel: 'whatsapp', by: { id: 9, name: 'Sokhna Sène' }, note: null, milestone: null }, { at: '2026-10-08T07:00:00Z', source: 'automatic', channel: null, by: null, note: null, milestone: 'overdue_1' }] };
      }
      if (/\/deposit-refund$/.test(url.pathname)) return { data: { deposit_amount: 500_000, deposit_refunded_amount: 0, deposit_remaining: 500_000, deposit_refunded_at: null, deposit_refund_reason: null, state: 'none', attachments: [] } };
      throw new Error(`requête inattendue : ${methode} ${chemin}`);
    },
  };
});

const { Impayes } = await import('../Impayes');

function bureau(actif: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: actif && /64rem|80rem/.test(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function rendre(ui: ReactElement = <Impayes agencyId={1} />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utilisateur = userEvent.setup();
  render(withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>));
  return utilisateur;
}

const historiques = () =>
  reseau.appels.filter((a) => a.chemin.startsWith('/api/payments/history')).map((a) => new URL(a.chemin, 'http://api.test').searchParams);

beforeEach(() => {
  reseau.appels.length = 0;
  reseau.refus.clear();
  toastAdd.mockClear();
  bureau(false);
  // Un lien `target=_blank` ne quitte pas la page de test.
  document.addEventListener('click', empecherLaNavigation, true);
});
afterEach(() => document.removeEventListener('click', empecherLaNavigation, true));
function empecherLaNavigation(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('a[href^="https://wa.me"], a[href^="tel:"]')) e.preventDefault();
}

const { useRelanceDUnImpaye } = await import('../useRelanceDUnImpaye');

const liens = () => reseau.appels.filter((a) => /\/payment-link$/.test(new URL(a.chemin, 'http://api.test').pathname));
const notes = () => reseau.appels.filter((a) => a.methode === 'POST' && /\/reminders$/.test(new URL(a.chemin, 'http://api.test').pathname));

describe('TCK-2660 (vérification) — le dossier du bureau', () => {
  it('F9 — « Échéances dues » : celles du SEUL locataire du dossier (`filter[payer_id]`)', async () => {
    bureau(true);
    lignes = [
      ligne(1, 34),
      ligne(2, 40, { remaining_amount: 410_000, amount_due: 410_000, period_start: '2026-09-01', due_date: '2026-09-05' }),
    ];
    const utilisateur = rendre();

    await utilisateur.click(await screen.findByRole('button', { name: 'Ouvrir le dossier de Locataire 1' }));
    const panneau = await screen.findByRole('dialog');
    await within(panneau).findByText('Échéances dues');
    await waitFor(() => expect(historiques().some((p) => p.get('filter[payer_id]') === '301')).toBe(true));

    const dossier = panneau.querySelector<HTMLElement>('[data-slot="dossier-impaye"]')!;
    await waitFor(() => expect(dossier).toHaveTextContent(/250\s000/u));
    // L'échéance de l'autre locataire (410 000, septembre) n'entre pas dans ce dossier.
    expect(dossier).not.toHaveTextContent(/410\s000/u);
  });

  it('F10 — « Appeler » du dossier note la relance (`call`) ; une échéance payée, non', async () => {
    bureau(true);
    lignes = [ligne(1, 34)];
    const utilisateur = rendre();
    await utilisateur.click(await screen.findByRole('button', { name: 'Ouvrir le dossier de Locataire 1' }));
    const panneau = await screen.findByRole('dialog');

    const appeler = within(panneau).getByRole('link', { name: /Appeler/ });
    expect(appeler.getAttribute('href')).toMatch(/^tel:/);
    await utilisateur.click(appeler);
    await waitFor(() => expect(notes()).toHaveLength(1));
    expect(notes()[0].chemin).toContain('/api/lease-payments/1/reminders');
    expect(notes()[0].corps).toEqual(expect.objectContaining({ channel: 'call' }));

    // Encaissée depuis le dossier : l'appel reste possible, il ne note plus de relance.
    await utilisateur.click(within(panneau).getByRole('button', { name: 'Encaisser un paiement' }));
    await utilisateur.click(screen.getByRole('button', { name: 'simuler l’encaissement' }));
    await waitFor(() => expect(within(panneau).getByRole('status')).toHaveTextContent('Échéance payée'));
    await utilisateur.click(within(panneau).getByRole('link', { name: /Appeler/ }));
    expect(notes()).toHaveLength(1);
  });
});

describe('TCK-2660 (vérification) — le lien de paiement ne part que sur un geste', () => {
  // Décision 1 du porteur (2026-11-12) — le lien n'est créé qu'à l'ENVOI : ni la liste, ni le dossier,
  // ni la relance ouverte n'en créent ; seul un geste d'envoi (« Ouvrir WhatsApp », « Copier »).
  it('F7 — la liste rendue (téléphone puis bureau) ne demande aucun lien, l’ouverture du dossier non plus', async () => {
    lignes = [ligne(1, 34), ligne(2, 3)];
    rendre();
    expect(await screen.findAllByRole('article')).toHaveLength(2);
    expect(liens()).toHaveLength(0);
    cleanup();

    bureau(true);
    const utilisateur = rendre();
    const ouvrir = await screen.findByRole('button', { name: 'Ouvrir le dossier de Locataire 1' });
    expect(liens()).toHaveLength(0);
    await utilisateur.click(ouvrir);
    expect(await screen.findByText('Créé à l’envoi de la relance')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(liens()).toHaveLength(0);
  });

  it('F7 — une relance montée, fermée PUIS ouverte, ne demande rien ; seul l’envoi crée le lien de son échéance', async () => {
    function Relance({ actif }: { readonly actif: boolean }) {
      const relance = useRelanceDUnImpaye(ligne(7, 12), actif);
      return (
        <>
          <p>{relance.etatDuLien}</p>
          <button type="button" onClick={() => void relance.creerLeLien()}>
            envoyer
          </button>
        </>
      );
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const vue = (actif: boolean) => withIntl(<QueryClientProvider client={client}><Relance actif={actif} /></QueryClientProvider>);
    const { rerender } = render(vue(false));
    await screen.findByText('inactif');
    await new Promise((r) => setTimeout(r, 50));
    expect(liens()).toHaveLength(0);

    rerender(vue(true));
    await screen.findByText('aCreer');
    await new Promise((r) => setTimeout(r, 50));
    expect(liens()).toHaveLength(0);

    screen.getByRole('button', { name: 'envoyer' }).click();
    await screen.findByText('pret');
    expect(liens().map((a) => a.chemin)).toEqual(['/api/lease-payments/7/payment-link']);
  });
});

describe('TCK-2660 (vérification) — les comptes des tranches', () => {
  it('F11 — trois lectures `per_page=1` sans `include` : un compte ne charge ni payeur, ni bien, ni relances', async () => {
    lignes = [ligne(1, 40), ligne(2, 12), ligne(3, 2)];
    rendre();
    await screen.findByRole('article', { name: 'Locataire 3' });

    await waitFor(() => expect(historiques().filter((p) => p.get('per_page') === '1')).toHaveLength(3));
    for (const compte of historiques().filter((p) => p.get('per_page') === '1')) expect(compte.get('include')).toBeNull();
  });
});

describe('TCK-2660 (fidélité a-2) — l’aperçu du message montre le lien comme la maquette', () => {
  it('le repère, puis le lien créé par « Copier », se lisent dans `lien-du-message` ; le texte de l’aperçu ne change pas', async () => {
    lignes = [ligne(1, 34)];
    const utilisateur = rendre();
    const carte = await screen.findByRole('article', { name: 'Locataire 1' });
    await utilisateur.click(within(carte).getByRole('button', { name: /Relancer sur WhatsApp/ }));

    const apercu = await waitFor(() => {
      const a = document.querySelector<HTMLElement>('[data-slot="apercu-du-message"]');
      expect(a).not.toBeNull();
      return a!;
    });
    const avant = apercu.textContent;
    expect(apercu.querySelector('[data-slot="lien-du-message"]')).toHaveTextContent('[lien de paiement ajouté à l’envoi]');

    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn(async () => undefined) } });
    await utilisateur.click(screen.getByRole('button', { name: /Copier/ }));
    await waitFor(() => expect(apercu.querySelector('[data-slot="lien-du-message"]')).toHaveTextContent(LIEN));
    expect(apercu.textContent).toBe(avant!.replace('[lien de paiement ajouté à l’envoi]', LIEN));
  });
});
