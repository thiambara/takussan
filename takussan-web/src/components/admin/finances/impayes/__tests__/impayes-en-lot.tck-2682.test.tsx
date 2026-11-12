/**
 * TCK-2682 — relancer une SÉLECTION d'impayés dans une file guidée (ADR-0105, amendement du
 * 2026-11-10) : une conversation WhatsApp après l'autre, chacune ouverte depuis le téléphone de
 * l'agence et notée ; « Passer » ne note rien ; une échéance sans numéro ou dont le lien rend 409 est
 * sautée avec sa raison ; le récapitulatif compte tout.
 *
 * Le réseau est le faux serveur de TCK-2660 derrière `apiRequest` : chaque requête est relevée, comme
 * dans l'onglet Réseau (AC1, AC2, AC3). Le message passe par la vraie action serveur.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
        const tri = lignes.filter((l) => (l.days_late ?? 0) >= min && (l.days_late ?? 0) <= max && l.status !== 'paid');
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


/** Les routes que la file a le droit d'appeler : la liste, la balance âgée, le lien, la note (AC3). */
const ROUTES_PERMISES = [/^\/api\/payments\/history$/, /^\/api\/agencies\/1\/finance\/aging$/, /^\/api\/lease-payments\/\d+\/payment-link$/, /^\/api\/lease-payments\/\d+\/reminders$/];
const chemins = () => reseau.appels.map((a) => `${a.methode} ${new URL(a.chemin, 'http://api.test').pathname}`);
const liens = () => chemins().filter((c) => /^POST \/api\/lease-payments\/\d+\/payment-link$/.test(c));
const notes = () => reseau.appels.filter((a) => a.methode === 'POST' && /\/reminders$/.test(a.chemin));
const sansNumero = (id: number) => ({ payer: { id: 300 + id, name: `Locataire ${id}`, phone: null, first_name: `Prénom${id}`, locale: null } });
const rangee = (nom: string) => screen.getAllByRole('row').find((r) => within(r).queryByRole('button', { name: `Ouvrir le dossier de ${nom}` }))!;
const file = () => document.querySelector<HTMLElement>('[data-slot="file-de-relance"]');
/** L'échéance que la file présente (son `id`), ou `null` au récapitulatif. */
const echeanceDeLaFile = () => file()?.getAttribute('data-echeance') ?? null;

async function cocherAuBureau(utilisateur: ReturnType<typeof userEvent.setup>, ...noms: string[]) {
  for (const nom of noms) await utilisateur.click(screen.getByRole('checkbox', { name: `Sélectionner l’impayé de ${nom}` }));
}

describe('TCK-2682 — la file guidée (bureau)', () => {
  beforeEach(() => bureau(true));

  it('AC1, AC2, AC3 — une file de 3 (normale, sans numéro, 409) : un seul lien demandé avant la première ouverture, 1 wa.me et 1 note, 2 sauts motivés, « 1 relancé · 0 passé · 2 sautés »', async () => {
    lignes = [ligne(1, 40), ligne(2, 30, sansNumero(2)), ligne(3, 20)];
    reseau.refus.add('lien:3');
    const utilisateur = rendre();
    await screen.findByRole('button', { name: 'Ouvrir le dossier de Locataire 3' });

    await utilisateur.click(screen.getByRole('checkbox', { name: 'Sélectionner toutes les échéances affichées' }));
    const barre = document.querySelector<HTMLElement>('[data-slot="barre-de-selection-impayes"]')!;
    expect(barre).toHaveTextContent('3 sélectionnés · 750 000 F');
    expect(liens()).toEqual([]);

    await utilisateur.click(within(barre).getByRole('button', { name: /WhatsApp/ }));

    // 1/3 — la normale : son lien, et lui seul, est demandé ; le message est composé.
    const ouvrir = await screen.findByRole('link', { name: /Ouvrir WhatsApp/ });
    expect(echeanceDeLaFile()).toBe('1');
    expect(screen.getByText('1 sur 3')).toBeInTheDocument();
    expect(new URL(ouvrir.getAttribute('href')!).pathname).toBe('/221771234567');
    expect(liens()).toEqual(['POST /api/lease-payments/1/payment-link']);
    // La rangée présentée est surlignée, la liste reste à côté.
    expect(rangee('Locataire 1')).toHaveAttribute('aria-current', 'true');

    await utilisateur.click(ouvrir);

    // 2/3 — sans numéro : sautée avec sa raison, AUCUN lien demandé pour elle.
    await waitFor(() => expect(echeanceDeLaFile()).toBe('2'));
    expect(screen.getByText('2 sur 3')).toBeInTheDocument();
    expect(file()!.querySelector('[data-slot="raison-du-saut"]')).toHaveTextContent('Aucun numéro pour ce locataire : cette échéance est sautée.');
    expect(screen.queryByRole('link', { name: /Ouvrir WhatsApp/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Passer' })).not.toBeInTheDocument();
    await utilisateur.click(within(file()!.closest<HTMLElement>('[role="dialog"]')!).getByRole('button', { name: 'Suivant' }));

    // 3/3 — 409 : sautée avec sa raison.
    await waitFor(() => expect(file()!.querySelector('[data-slot="raison-du-saut"]')).toHaveTextContent('Cette échéance ne se paie plus en ligne : elle est sautée.'));
    expect(echeanceDeLaFile()).toBe('3');
    await utilisateur.click(within(file()!.closest<HTMLElement>('[role="dialog"]')!).getByRole('button', { name: 'Suivant' }));

    // Le récapitulatif.
    const recap = await waitFor(() => {
      const r = document.querySelector<HTMLElement>('[data-slot="recapitulatif"]');
      expect(r).not.toBeNull();
      return r!;
    });
    expect(within(recap).getByRole('status')).toHaveTextContent('1 relancé · 0 passé · 2 sautés');
    const sautes = within(recap).getAllByRole('listitem');
    expect(sautes.map((li) => li.textContent)).toEqual(['Locataire 2aucun numéro', 'Locataire 3ne se paie plus en ligne']);

    expect(liens()).toEqual(['POST /api/lease-payments/1/payment-link', 'POST /api/lease-payments/3/payment-link']);
    expect(notes().map((n) => [n.chemin, n.corps])).toEqual([['/api/lease-payments/1/reminders', { channel: 'whatsapp' }]]);
    // AC3 — aucune autre route : ni envoi de SMS, ni WhatsApp de la plateforme.
    expect(chemins().filter((c) => !ROUTES_PERMISES.some((r) => r.test(c.split(' ')[1])))).toEqual([]);

    // « Terminer » : la liste, où seule la relancée dit « relancé aujourd’hui » (AC5) ; les sautées restent cochées.
    await utilisateur.click(screen.getByRole('button', { name: 'Terminer' }));
    await waitFor(() => expect(file()).toBeNull());
    expect(within(rangee('Locataire 1')).getByText('relancé aujourd’hui')).toBeInTheDocument();
    expect(within(rangee('Locataire 2')).getByText('jamais relancé')).toBeInTheDocument();
    expect(within(rangee('Locataire 3')).getByText('jamais relancé')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Sélectionner l’impayé de Locataire 1' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Sélectionner l’impayé de Locataire 2' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Sélectionner l’impayé de Locataire 3' })).toBeChecked();
    expect(document.querySelector('[data-slot="barre-de-selection-impayes"]')).toHaveTextContent('2 sélectionnés');
  });

  it('« Passer » ne note rien et demande le lien de la suivante seulement quand elle s’affiche ; « Arrêter » rend la liste, sélection intacte', async () => {
    lignes = [ligne(1, 40), ligne(2, 30), ligne(3, 20)];
    const utilisateur = rendre();
    await screen.findByRole('button', { name: 'Ouvrir le dossier de Locataire 3' });
    await cocherAuBureau(utilisateur, 'Locataire 1', 'Locataire 2', 'Locataire 3');
    await utilisateur.click(within(document.querySelector<HTMLElement>('[data-slot="barre-de-selection-impayes"]')!).getByRole('button', { name: /WhatsApp/ }));

    await screen.findByRole('link', { name: /Ouvrir WhatsApp/ });
    expect(liens()).toEqual(['POST /api/lease-payments/1/payment-link']);
    await utilisateur.click(screen.getByRole('button', { name: 'Passer' }));

    await waitFor(() => expect(echeanceDeLaFile()).toBe('2'));
    await screen.findByRole('link', { name: /Ouvrir WhatsApp/ });
    expect(liens()).toEqual(['POST /api/lease-payments/1/payment-link', 'POST /api/lease-payments/2/payment-link']);

    await utilisateur.click(screen.getByRole('button', { name: 'Arrêter' }));
    await waitFor(() => expect(file()).toBeNull());
    expect(notes()).toEqual([]);
    expect(document.querySelector('[data-slot="barre-de-selection-impayes"]')).toHaveTextContent('3 sélectionnés');
    for (const n of [1, 2, 3]) expect(screen.getByRole('checkbox', { name: `Sélectionner l’impayé de Locataire ${n}` })).toBeChecked();
    // Le lien de la 3ᵉ n'a jamais été demandé : elle n'a pas été présentée.
    expect(liens()).not.toContain('POST /api/lease-payments/3/payment-link');
  });

  it('une note refusée n’arrête pas la file, mais le récapitulatif le DIT : « relance non notée »', async () => {
    lignes = [ligne(1, 40), ligne(2, 30)];
    reseau.refus.add('note:1');
    const utilisateur = rendre();
    await screen.findByRole('button', { name: 'Ouvrir le dossier de Locataire 2' });
    await cocherAuBureau(utilisateur, 'Locataire 1', 'Locataire 2');
    await utilisateur.click(within(document.querySelector<HTMLElement>('[data-slot="barre-de-selection-impayes"]')!).getByRole('button', { name: /WhatsApp/ }));

    await utilisateur.click(await screen.findByRole('link', { name: /Ouvrir WhatsApp/ }));
    await waitFor(() => expect(echeanceDeLaFile()).toBe('2'));
    await utilisateur.click(await screen.findByRole('link', { name: /Ouvrir WhatsApp/ }));

    const recap = await waitFor(() => {
      const r = document.querySelector<HTMLElement>('[data-slot="recapitulatif"]');
      expect(r).toHaveTextContent('relance non notée');
      return r!;
    });
    expect(within(recap).getByRole('status')).toHaveTextContent('2 relancés · 0 passé · 0 sauté');
    const nonNotees = within(recap).getAllByRole('listitem');
    expect(nonNotees.map((li) => li.textContent)).toEqual(['Locataire 1relance non notée']);
    expect(notes().map((n) => n.chemin)).toEqual(['/api/lease-payments/1/reminders', '/api/lease-payments/2/reminders']);
  });

  it('la sélection survit aux pages ; la barre dit ce qui n’est pas affiché, et la file le reprend, dans l’ordre du retard', async () => {
    lignes = Array.from({ length: 25 }, (_, i) => ligne(i + 1, 60 - i));
    const utilisateur = rendre();
    await screen.findByRole('button', { name: 'Ouvrir le dossier de Locataire 20' });
    await cocherAuBureau(utilisateur, 'Locataire 2');

    await utilisateur.click(screen.getByRole('button', { name: 'Suivant' }));
    await screen.findByRole('button', { name: 'Ouvrir le dossier de Locataire 25' });
    await cocherAuBureau(utilisateur, 'Locataire 24');

    const barre = document.querySelector<HTMLElement>('[data-slot="barre-de-selection-impayes"]')!;
    expect(barre).toHaveTextContent('2 sélectionnés');
    expect(within(barre).getByText('dont 1 non affiché')).toBeInTheDocument();

    // Un filtre qui écarte les deux : la barre reste, et le dit.
    await utilisateur.click(screen.getByRole('button', { name: /Moins de 8 j/ }));
    await waitFor(() => expect(within(document.querySelector<HTMLElement>('[data-slot="barre-de-selection-impayes"]')!).getByText('dont 2 non affichés')).toBeInTheDocument());

    await utilisateur.click(within(document.querySelector<HTMLElement>('[data-slot="barre-de-selection-impayes"]')!).getByRole('button', { name: /WhatsApp/ }));
    // La plus en retard d'abord (Locataire 2, 59 j), puis Locataire 24 (37 j) — aucune des deux n'est affichée.
    await waitFor(() => expect(echeanceDeLaFile()).toBe('2'));
    expect(screen.getByText('1 sur 2')).toBeInTheDocument();
    await utilisateur.click(screen.getByRole('button', { name: 'Passer' }));
    await waitFor(() => expect(echeanceDeLaFile()).toBe('24'));
    expect(screen.getByText('2 sur 2')).toBeInTheDocument();
  });
  it('une échéance encaissée depuis le dossier quitte la sélection (et donc la file)', async () => {
    lignes = [ligne(1, 40), ligne(2, 30)];
    const utilisateur = rendre();
    await screen.findByRole('button', { name: 'Ouvrir le dossier de Locataire 2' });
    await cocherAuBureau(utilisateur, 'Locataire 1', 'Locataire 2');
    expect(document.querySelector('[data-slot="barre-de-selection-impayes"]')).toHaveTextContent('2 sélectionnés');

    await utilisateur.click(screen.getByRole('button', { name: 'Ouvrir le dossier de Locataire 1' }));
    const panneau = await screen.findByRole('dialog');
    await utilisateur.click(within(panneau).getByRole('button', { name: 'Encaisser un paiement' }));
    // L'encaissement rend la ligne payée : le faux serveur ne la liste plus.
    lignes = [{ ...lignes[0], status: 'paid' }, lignes[1]];
    await utilisateur.click(screen.getByRole('button', { name: 'simuler l’encaissement' }));

    await waitFor(() => expect(document.querySelector('[data-slot="barre-de-selection-impayes"]')).toHaveTextContent('1 sélectionné'));
    expect(document.querySelector('[data-slot="barre-de-selection-impayes"]')).not.toHaveTextContent('non affiché');
  });
});

describe('TCK-2682 — le mode sélection (téléphone)', () => {
  it('« Sélectionner » pose une case par carte ; « Tout sélectionner » coche les cartes affichées ; Échap, « Annuler » et le geste retour en sortent, sélection vidée', async () => {
    lignes = [ligne(1, 40), ligne(2, 30), ligne(3, 20)];
    const utilisateur = rendre();
    await screen.findByRole('article', { name: 'Locataire 3' });
    expect(screen.queryAllByRole('checkbox')).toEqual([]);

    // Échap
    await utilisateur.click(screen.getByRole('button', { name: 'Sélectionner des impayés à relancer' }));
    expect(within(screen.getByRole('article', { name: 'Locataire 1' })).getByRole('checkbox', { name: 'Sélectionner l’impayé de Locataire 1' })).not.toBeChecked();
    await utilisateur.click(screen.getByRole('checkbox', { name: 'Sélectionner l’impayé de Locataire 2' }));
    expect(document.querySelector('[data-slot="tete-de-selection"]')).toHaveTextContent('1 sélectionné');
    await utilisateur.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryAllByRole('checkbox')).toEqual([]));

    // « Tout sélectionner », puis « Annuler »
    await utilisateur.click(screen.getByRole('button', { name: 'Sélectionner des impayés à relancer' }));
    expect(screen.getByRole('checkbox', { name: 'Sélectionner l’impayé de Locataire 2' })).not.toBeChecked();
    await utilisateur.click(screen.getByRole('button', { name: 'Tout sélectionner' }));
    for (const n of [1, 2, 3]) expect(screen.getByRole('checkbox', { name: `Sélectionner l’impayé de Locataire ${n}` })).toBeChecked();
    expect(screen.getAllByRole('button', { name: 'Relancer la sélection (3)' }).length).toBeGreaterThan(0);
    await utilisateur.click(screen.getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryAllByRole('checkbox')).toEqual([]));

    // Le geste retour
    await utilisateur.click(screen.getByRole('button', { name: 'Sélectionner des impayés à relancer' }));
    await utilisateur.click(screen.getByRole('checkbox', { name: 'Sélectionner l’impayé de Locataire 1' }));
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(screen.queryAllByRole('checkbox')).toEqual([]));
    expect(notes()).toEqual([]);
  });

  it('« Relancer la sélection » ouvre la file plein écran avec sa position ; « Ouvrir WhatsApp » au pied', async () => {
    lignes = [ligne(1, 40), ligne(2, 30)];
    const utilisateur = rendre();
    await screen.findByRole('article', { name: 'Locataire 2' });
    await utilisateur.click(screen.getByRole('button', { name: 'Sélectionner des impayés à relancer' }));
    await utilisateur.click(screen.getByRole('button', { name: 'Tout sélectionner' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Relancer la sélection (2)' })[0]);

    const panneau = await screen.findByRole('dialog', { name: 'Relancer Locataire 1' });
    expect(panneau).toHaveAttribute('data-regime', 'plein-ecran');
    expect(within(panneau).getAllByText('1 sur 2').length).toBeGreaterThan(0);
    const pied = panneau.querySelector('[data-slot="panneau-droit-pied"]')!;
    expect(await within(pied as HTMLElement).findByRole('link', { name: /Ouvrir WhatsApp/ })).toBeInTheDocument();
  });
});
