/**
 * TCK-2682 — relancer une SÉLECTION d'impayés dans une file guidée (ADR-0105, amendement du
 * 2026-11-10) : une conversation WhatsApp après l'autre, chacune ouverte depuis le téléphone de
 * l'agence et notée ; « Passer » ne note rien ; une échéance sans numéro ou dont le lien rend 409 est
 * sautée avec sa raison ; le récapitulatif compte tout.
 *
 * Le réseau est le faux serveur de TCK-2660 derrière `apiRequest` : chaque requête est relevée, comme
 * dans l'onglet Réseau (AC1, AC2, AC3). Le message passe par la vraie action serveur.
 *
 * Décision 1 du porteur (2026-11-12, TCK-2660) : le lien de paiement d'une échéance n'est créé qu'au
 * clic sur « Ouvrir WhatsApp » — présenter une échéance, ou la passer, n'en crée aucun. « Ouvrir
 * WhatsApp » est un BOUTON : il crée le lien, puis ouvre `wa.me` par `window.open` (relevé ici).
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

const reseau = vi.hoisted(() => ({ appels: [] as { chemin: string; methode: string; corps: unknown }[], refus: new Set<string>(), enAttente: [] as (() => void)[] }));
/** Le navigateur : bloque-t-il l'onglet que `window.open` demande après l'attente du lien ? */
const navigateur = vi.hoisted(() => ({ bloque: false }));
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
// Décision 3 — le message nomme l'agence du profil actif.
vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => ({
    data: { data: [{ id: 'agent:1', agency: { id: 1, name: 'Keur Immo', slug: 'keur-immo' } }], meta: { active_profile_id: 'agent:1', count: 1 } },
    isLoading: false,
  }),
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
        const tri = lignes.filter((l) => (l.days_late ?? 0) >= min && (l.days_late ?? 0) <= max && (l.status !== 'paid' || reseau.refus.has('history:avecPayees')));
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
        // Un lien encore en route : il ne revient qu'à `relacher()`.
        if (reseau.refus.has('lien:attendre')) return new Promise((r) => reseau.enAttente.push(() => r({ data: { url: LIEN, expires_at: null } })));
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
  reseau.enAttente.length = 0;
  suivis.length = 0;
  ouverts.length = 0;
  navigateur.bloque = false;
  toastAdd.mockClear();
  bureau(false);
  // L'horloge est FIGÉE (les minuteurs restent réels) : un geste de la file ne s'arme qu'après
  // `armer()` — deux clics sans `armer()` entre eux sont un double-clic (armement.ts).
  vi.useFakeTimers({ toFake: ['Date'] });
  window.addEventListener('click', suivreLeLien);
  fenetres.length = 0;
  // Une fausse fenêtre : ouverte VIDE au clic, envoyée vers wa.me (`location.href`) une fois le lien
  // créé — c'est là qu'on relève l'échéance présentée — ou refermée. Non mesuré au navigateur réel.
  vi.spyOn(window, 'open').mockImplementation(() => {
    if (navigateur.bloque) return null;
    const f = { opener: {} as unknown, fermee: false, close: () => void (f.fermee = true), location: {} as { href: string } };
    Object.defineProperty(f.location, 'href', {
      get: () => '',
      set: (adresse: string) => ouverts.push({ href: new URL(adresse), echeance: echeanceDeLaFile() }),
    });
    fenetres.push(f);
    return f as unknown as Window;
  });
});
afterEach(() => {
  window.removeEventListener('click', suivreLeLien);
  vi.mocked(window.open).mockRestore();
  vi.useRealTimers();
});

/** Un geste de la file est armé 500 ms après son arrivée : on avance l'horloge figée de 600 ms. */
const armer = () => vi.setSystemTime(Date.now() + 600);

/**
 * Ce que « Ouvrir WhatsApp » a ouvert (`window.open`), avec l'échéance que la file présentait À CET
 * INSTANT : l'onglet doit être celui du locataire présenté, jamais celui du suivant.
 */
const ouverts: { readonly href: URL; readonly echeance: string | null }[] = [];
const numerosOuverts = () => ouverts.map((o) => o.href.pathname);
const fenetres: { opener: unknown; fermee: boolean }[] = [];
/** Rend les liens retenus en route (`lien:attendre`), puis laisse React valider ce qui suit. */
async function relacher() {
  await act(async () => {
    reseau.enAttente.splice(0).forEach((r) => r());
  });
  await act(async () => {});
}

/**
 * Le repli d'un onglet bloqué : l'ancre « Touchez encore » que le NAVIGATEUR suivrait. Il suit l'`href` de l'ancre cliquée après tous les écouteurs ET
 * leurs microtâches — où React valide le rendu du clic : on le lit donc dans une microtâche posée
 * depuis `window`, en fin de bouillonnement, avec l'échéance que la file présente à cet instant.
 * Un clic que le composant a refusé (`defaultPrevented`) ne suit rien. Puis on empêche la navigation :
 * un lien `target=_blank` ne quitte pas la page de test.
 */
const suivis: { readonly ancre: HTMLAnchorElement; readonly href: string | null; readonly connectee: boolean; readonly echeance: string | null }[] = [];
function suivreLeLien(e: MouseEvent) {
  const ancre = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="https://wa.me"], a[href^="tel:"]');
  if (!ancre) return;
  if (!e.defaultPrevented) {
    queueMicrotask(() => suivis.push({ ancre, href: ancre.getAttribute('href'), connectee: ancre.isConnected, echeance: echeanceDeLaFile() }));
  }
  e.preventDefault();
}
const numeroSuivi = (i: number) => new URL(suivis[i].href!).pathname;
const avecNumero = (id: number, phone: string) => ({ payer: { id: 300 + id, name: `Locataire ${id}`, phone, first_name: `Prénom${id}`, locale: null } });


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

/** Le bouton « Ouvrir WhatsApp » de l'échéance `id`, prêt (son message est composé). */
const boutonDe = async (id: string) =>
  waitFor(() => {
    expect(echeanceDeLaFile()).toBe(id);
    const b = screen.getByRole<HTMLButtonElement>('button', { name: /Ouvrir WhatsApp/ });
    expect(b).toBeEnabled();
    return b;
  });
const dialogue = () => file()!.closest<HTMLElement>('[role="dialog"]')!;

describe('TCK-2682 — la file guidée (bureau)', () => {
  beforeEach(() => bureau(true));

  it('AC1, AC2, AC3 — une file de 3 (normale, sans numéro, 409) : aucun lien à l’affichage, le lien créé au clic, 1 wa.me et 1 note, 2 sauts motivés, « 1 relancé · 0 passé · 2 sautés »', async () => {
    lignes = [ligne(1, 40), ligne(2, 30, sansNumero(2)), ligne(3, 20)];
    reseau.refus.add('lien:3');
    const utilisateur = rendre();
    await screen.findByRole('button', { name: 'Ouvrir le dossier de Locataire 3' });

    await utilisateur.click(screen.getByRole('checkbox', { name: 'Sélectionner toutes les échéances affichées' }));
    const barre = document.querySelector<HTMLElement>('[data-slot="barre-de-selection-impayes"]')!;
    expect(barre).toHaveTextContent('3 sélectionnés · 750 000 F');
    expect(liens()).toEqual([]);

    await utilisateur.click(within(barre).getByRole('button', { name: /WhatsApp/ }));

    // 1/3 — la normale : le message est composé, avec le repère du lien ; AUCUN lien n'est créé.
    const ouvrir = await boutonDe('1');
    expect(screen.getByText('1 sur 3')).toBeInTheDocument();
    expect(within(dialogue()).getByText(/\[lien de paiement ajouté à l’envoi\]/)).toBeInTheDocument();
    expect(liens()).toEqual([]);
    // La rangée présentée est surlignée, la liste reste à côté.
    expect(rangee('Locataire 1')).toHaveAttribute('aria-current', 'true');

    armer();
    await utilisateur.click(ouvrir);
    // Le clic crée le lien de CETTE échéance, puis ouvre WhatsApp chez son locataire, lien dans le message.
    await waitFor(() => expect(ouverts).toHaveLength(1));
    expect(liens()).toEqual(['POST /api/lease-payments/1/payment-link']);
    expect(ouverts[0].href.pathname).toBe('/221771234567');
    expect(ouverts[0].echeance).toBe('1');
    expect(ouverts[0].href.searchParams.get('text')).toContain(LIEN);
    expect(ouverts[0].href.searchParams.get('text')).toContain('De la part de Keur Immo.');

    // 2/3 — sans numéro : sautée avec sa raison, AUCUN lien demandé pour elle.
    await waitFor(() => expect(echeanceDeLaFile()).toBe('2'));
    expect(screen.getByText('2 sur 3')).toBeInTheDocument();
    expect(file()!.querySelector('[data-slot="raison-du-saut"]')).toHaveTextContent('Aucun numéro pour ce locataire : cette échéance est sautée.');
    expect(screen.queryByRole('button', { name: /Ouvrir WhatsApp/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Passer' })).not.toBeInTheDocument();
    armer();
    await utilisateur.click(within(dialogue()).getByRole('button', { name: 'Suivant' }));

    // 3/3 — le 409 n'arrive qu'au clic : rien ne s'ouvre, rien n'est noté, l'échéance est sautée avec sa raison.
    const troisieme = await boutonDe('3');
    expect(liens()).toEqual(['POST /api/lease-payments/1/payment-link']);
    armer();
    await utilisateur.click(troisieme);
    await waitFor(() => expect(file()!.querySelector('[data-slot="raison-du-saut"]')).toHaveTextContent('Cette échéance ne se paie plus en ligne : elle est sautée.'));
    expect(echeanceDeLaFile()).toBe('3');
    expect(ouverts).toHaveLength(1);
    // L'onglet ouvert vide au clic de la 3ᵉ est refermé.
    expect(fenetres.map((f) => f.fermee)).toEqual([false, true]);
    armer();
    await utilisateur.click(within(dialogue()).getByRole('button', { name: 'Suivant' }));

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

  it('« Passer » ne note rien et ne crée aucun lien ; « Arrêter » rend la liste, sélection intacte', async () => {
    lignes = [ligne(1, 40), ligne(2, 30), ligne(3, 20)];
    const utilisateur = rendre();
    await screen.findByRole('button', { name: 'Ouvrir le dossier de Locataire 3' });
    await cocherAuBureau(utilisateur, 'Locataire 1', 'Locataire 2', 'Locataire 3');
    await relancerAuBureau(utilisateur);

    await boutonDe('1');
    armer();
    await utilisateur.click(screen.getByRole('button', { name: 'Passer' }));
    await boutonDe('2');

    await utilisateur.click(screen.getByRole('button', { name: 'Arrêter' }));
    await waitFor(() => expect(file()).toBeNull());
    expect(notes()).toEqual([]);
    // Décision 1 — deux échéances présentées, une passée : aucun lien de paiement créé.
    expect(liens()).toEqual([]);
    expect(ouverts).toEqual([]);
    expect(document.querySelector('[data-slot="barre-de-selection-impayes"]')).toHaveTextContent('3 sélectionnés');
    for (const n of [1, 2, 3]) expect(screen.getByRole('checkbox', { name: `Sélectionner l’impayé de Locataire ${n}` })).toBeChecked();
  });

  it('une note refusée n’arrête pas la file, mais le récapitulatif le DIT : « relance non notée »', async () => {
    lignes = [ligne(1, 40), ligne(2, 30)];
    reseau.refus.add('note:1');
    const utilisateur = rendre();
    await screen.findByRole('button', { name: 'Ouvrir le dossier de Locataire 2' });
    await cocherAuBureau(utilisateur, 'Locataire 1', 'Locataire 2');
    await relancerAuBureau(utilisateur);

    const premiere = await boutonDe('1');
    armer();
    await utilisateur.click(premiere);
    await waitFor(() => expect(echeanceDeLaFile()).toBe('2'));
    // m1 — la note refusée se dit DANS le panneau, au nom du locataire, et pas par un toast posé sur
    // le geste suivant ; le composer ne l'impute pas au locataire présenté.
    const dite = await waitFor(() => {
      const p = file()!.querySelector<HTMLElement>('[data-slot="note-refusee"]');
      expect(p).not.toBeNull();
      return p!;
    });
    expect(dite).toHaveAttribute('role', 'alert');
    expect(dite).toHaveTextContent('La relance de Locataire 1 n’a pas pu être notée. Le récapitulatif la rappellera.');
    expect(within(file()!).queryByText('La relance n’a pas pu être notée.')).not.toBeInTheDocument();
    expect(toastAdd).not.toHaveBeenCalled();
    const seconde = await boutonDe('2');
    armer();
    await utilisateur.click(seconde);

    const recap = await waitFor(() => {
      const r = document.querySelector<HTMLElement>('[data-slot="recapitulatif"]');
      expect(r).toHaveTextContent('relance non notée');
      return r!;
    });
    expect(within(recap).getByRole('status')).toHaveTextContent('2 relancés · 0 passé · 0 sauté');
    const nonNotees = within(recap).getAllByRole('listitem');
    expect(nonNotees.map((li) => li.textContent)).toEqual(['Locataire 1relance non notée']);
    expect(notes().map((n) => n.chemin)).toEqual(['/api/lease-payments/1/reminders', '/api/lease-payments/2/reminders']);
    expect(recap.querySelector('[data-slot="note-refusee"]')).toBeNull();
    expect(toastAdd).not.toHaveBeenCalled();
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
    armer();
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

const barreDeSelection = () => document.querySelector<HTMLElement>('[data-slot="barre-de-selection-impayes"]')!;
const relancerAuBureau = (utilisateur: ReturnType<typeof userEvent.setup>) => utilisateur.click(within(barreDeSelection()).getByRole('button', { name: /WhatsApp/ }));

describe('TCK-2682 — la file ne se trompe jamais de locataire (bureau)', () => {
  beforeEach(() => bureau(true));

  it('l’onglet ouvert est celui de l’échéance cliquée, ouvert pendant qu’elle est présentée ; la suivante a SON propre bouton', async () => {
    lignes = [ligne(1, 40, avecNumero(1, '+221771111111')), ligne(2, 30, avecNumero(2, '+221772222222'))];
    const utilisateur = rendre();
    await screen.findByRole('button', { name: 'Ouvrir le dossier de Locataire 2' });
    await cocherAuBureau(utilisateur, 'Locataire 1', 'Locataire 2');
    await relancerAuBureau(utilisateur);

    const premiere = await boutonDe('1');
    armer();
    await utilisateur.click(premiere);
    // Le numéro de Locataire 1, et la file le présentait encore quand l'onglet s'est ouvert : l'attente
    // du lien ne laisse pas la file avancer sous le clic.
    await waitFor(() => expect(ouverts).toHaveLength(1));
    expect(numerosOuverts()).toEqual(['/221771111111']);
    expect(ouverts[0].echeance).toBe('1');

    const seconde = await boutonDe('2');
    expect(seconde).not.toBe(premiere);
    expect(premiere.isConnected).toBe(false);
    armer();
    await utilisateur.click(seconde);
    await waitFor(() => expect(numerosOuverts()).toEqual(['/221771111111', '/221772222222']));
    expect(ouverts[1].echeance).toBe('2');
    expect(liens()).toEqual(['POST /api/lease-payments/1/payment-link', 'POST /api/lease-payments/2/payment-link']);
  });

  it('d1 — un double-clic sur « Ouvrir WhatsApp » : un seul lien, un seul onglet, une seule note ; le second clic n’agit pas chez le locataire suivant', async () => {
    lignes = [ligne(1, 40, avecNumero(1, '+221771111111')), ligne(2, 30, avecNumero(2, '+221772222222')), ligne(3, 20)];
    const utilisateur = rendre();
    await screen.findByRole('button', { name: 'Ouvrir le dossier de Locataire 3' });
    await cocherAuBureau(utilisateur, 'Locataire 1', 'Locataire 2', 'Locataire 3');
    await relancerAuBureau(utilisateur);

    // Deux clics sur le même bouton, le second pendant la création du lien.
    const premiere = await boutonDe('1');
    armer();
    await utilisateur.dblClick(premiere);
    await waitFor(() => expect(echeanceDeLaFile()).toBe('2'));
    expect(liens()).toEqual(['POST /api/lease-payments/1/payment-link']);
    expect(numerosOuverts()).toEqual(['/221771111111']);

    // Le second clic du double-clic tombe sur le bouton de Locataire 2, sans que l'horloge ait bougé.
    const seconde = await boutonDe('2');
    await utilisateur.click(seconde);
    expect(liens()).toEqual(['POST /api/lease-payments/1/payment-link']);
    expect(numerosOuverts()).toEqual(['/221771111111']);
    expect(notes().map((n) => n.chemin)).toEqual(['/api/lease-payments/1/reminders']);
    expect(echeanceDeLaFile()).toBe('2');
    expect(screen.getByText('2 sur 3')).toBeInTheDocument();

    // Armé, le même bouton crée le lien de Locataire 2, ouvre son WhatsApp et note SA relance.
    armer();
    await utilisateur.click(seconde);
    await waitFor(() => expect(numerosOuverts()).toEqual(['/221771111111', '/221772222222']));
    await waitFor(() => expect(notes().map((n) => n.chemin)).toEqual(['/api/lease-payments/1/reminders', '/api/lease-payments/2/reminders']));
  });

  it('un lien encore en route quand l’agent passe : rien ne s’ouvre ni n’est noté, et l’échéance reste PASSÉE au récapitulatif', async () => {
    lignes = [ligne(1, 40, avecNumero(1, '+221771111111')), ligne(2, 30, avecNumero(2, '+221772222222'))];
    reseau.refus.add('lien:attendre');
    const utilisateur = rendre();
    await screen.findByRole('button', { name: 'Ouvrir le dossier de Locataire 2' });
    await cocherAuBureau(utilisateur, 'Locataire 1', 'Locataire 2');
    await relancerAuBureau(utilisateur);

    const premiere = await boutonDe('1');
    armer();
    await utilisateur.click(premiere);
    await waitFor(() => expect(liens()).toEqual(['POST /api/lease-payments/1/payment-link']));
    await utilisateur.click(screen.getByRole('button', { name: 'Passer' }));
    await waitFor(() => expect(echeanceDeLaFile()).toBe('2'));
    await relacher();
    expect(ouverts).toEqual([]);
    expect(notes()).toEqual([]);
    expect(fenetres.map((f) => f.fermee)).toEqual([true]);

    await boutonDe('2');
    armer();
    await utilisateur.click(screen.getByRole('button', { name: 'Passer' }));
    const recap = await waitFor(() => {
      const r = document.querySelector<HTMLElement>('[data-slot="recapitulatif"]');
      expect(r).not.toBeNull();
      return r!;
    });
    expect(within(recap).getByRole('status')).toHaveTextContent('0 relancé · 2 passés · 0 sauté');
    expect(ouverts).toEqual([]);
    expect(notes()).toEqual([]);
  });

  it('un lien encore en route quand l’agent arrête la file : rien ne s’ouvre ni n’est noté', async () => {
    lignes = [ligne(1, 40, avecNumero(1, '+221771111111'))];
    reseau.refus.add('lien:attendre');
    const utilisateur = rendre();
    await screen.findByRole('button', { name: 'Ouvrir le dossier de Locataire 1' });
    await cocherAuBureau(utilisateur, 'Locataire 1');
    await relancerAuBureau(utilisateur);

    const bouton = await boutonDe('1');
    armer();
    await utilisateur.click(bouton);
    await waitFor(() => expect(liens()).toHaveLength(1));
    await utilisateur.click(screen.getByRole('button', { name: 'Arrêter' }));
    await waitFor(() => expect(file()).toBeNull());
    await relacher();
    expect(ouverts).toEqual([]);
    expect(notes()).toEqual([]);
    expect(fenetres.map((f) => f.fermee)).toEqual([true]);
  });

  it('deux clics pendant la création du lien : un seul lien, un seul onglet, une seule note', async () => {
    lignes = [ligne(1, 40, avecNumero(1, '+221771111111')), ligne(2, 30)];
    reseau.refus.add('lien:attendre');
    const utilisateur = rendre();
    await screen.findByRole('button', { name: 'Ouvrir le dossier de Locataire 2' });
    await cocherAuBureau(utilisateur, 'Locataire 1', 'Locataire 2');
    await relancerAuBureau(utilisateur);

    const bouton = await boutonDe('1');
    armer();
    await utilisateur.click(bouton);
    await utilisateur.click(bouton);
    expect(liens()).toEqual(['POST /api/lease-payments/1/payment-link']);
    expect(fenetres).toHaveLength(1);
    await relacher();
    await waitFor(() => expect(numerosOuverts()).toEqual(['/221771111111']));
    await waitFor(() => expect(notes().map((n) => n.chemin)).toEqual(['/api/lease-payments/1/reminders']));
    expect(liens()).toEqual(['POST /api/lease-payments/1/payment-link']);
  });

  it('un onglet bloqué par le navigateur : la file attend, « Touchez encore » ouvre WhatsApp chez CE locataire, note, puis avance — sans second lien', async () => {
    lignes = [ligne(1, 40, avecNumero(1, '+221771111111')), ligne(2, 30, avecNumero(2, '+221772222222'))];
    navigateur.bloque = true;
    const utilisateur = rendre();
    await screen.findByRole('button', { name: 'Ouvrir le dossier de Locataire 2' });
    await cocherAuBureau(utilisateur, 'Locataire 1', 'Locataire 2');
    await relancerAuBureau(utilisateur);

    armer();
    await utilisateur.click(await boutonDe('1'));
    const retoucher = await screen.findByRole<HTMLAnchorElement>('link', { name: 'Touchez encore pour ouvrir WhatsApp' });
    // Rien n'est noté tant que WhatsApp ne s'est pas ouvert, et la file présente toujours Locataire 1.
    expect(notes()).toEqual([]);
    expect(echeanceDeLaFile()).toBe('1');

    await utilisateur.click(retoucher);
    expect(suivis.map((_, i) => numeroSuivi(i))).toEqual(['/221771111111']);
    expect(suivis[0].echeance).toBe('1');
    expect(new URL(suivis[0].href!).searchParams.get('text')).toContain(LIEN);
    await waitFor(() => expect(echeanceDeLaFile()).toBe('2'));
    await waitFor(() => expect(notes().map((n) => n.chemin)).toEqual(['/api/lease-payments/1/reminders']));
    expect(liens()).toEqual(['POST /api/lease-payments/1/payment-link']);
  });

  it('un double-clic sur « Passer » ne passe qu’une échéance', async () => {
    lignes = [ligne(1, 40), ligne(2, 30), ligne(3, 20)];
    const utilisateur = rendre();
    await screen.findByRole('button', { name: 'Ouvrir le dossier de Locataire 3' });
    await cocherAuBureau(utilisateur, 'Locataire 1', 'Locataire 2', 'Locataire 3');
    await relancerAuBureau(utilisateur);
    await boutonDe('1');
    armer();
    await utilisateur.click(screen.getByRole('button', { name: 'Passer' }));
    await waitFor(() => expect(echeanceDeLaFile()).toBe('2'));
    await utilisateur.click(screen.getByRole('button', { name: 'Passer' }));
    expect(echeanceDeLaFile()).toBe('2');
    expect(screen.getByText('2 sur 3')).toBeInTheDocument();
  });

  it('m2 — une échéance payée entre-temps reste dans la file : sautée, « déjà payée », sans lien demandé ; « Terminer » ne la garde pas', async () => {
    reseau.refus.add('history:avecPayees');
    lignes = [ligne(1, 40, { status: 'paid' }), ligne(2, 30)];
    const utilisateur = rendre();
    await screen.findByRole('button', { name: 'Ouvrir le dossier de Locataire 2' });
    await cocherAuBureau(utilisateur, 'Locataire 1', 'Locataire 2');
    expect(barreDeSelection()).toHaveTextContent('2 sélectionnés');
    await relancerAuBureau(utilisateur);

    await waitFor(() => expect(echeanceDeLaFile()).toBe('1'));
    expect(screen.getByText('1 sur 2')).toBeInTheDocument();
    expect(file()!.querySelector('[data-slot="raison-du-saut"]')).toHaveTextContent('Cette échéance est déjà payée : elle est sautée.');
    armer();
    await utilisateur.click(within(dialogue()).getByRole('button', { name: 'Suivant' }));
    await boutonDe('2');
    armer();
    await utilisateur.click(screen.getByRole('button', { name: 'Passer' }));

    const recap = await waitFor(() => {
      const r = document.querySelector<HTMLElement>('[data-slot="recapitulatif"]');
      expect(r).not.toBeNull();
      return r!;
    });
    expect(within(recap).getByRole('status')).toHaveTextContent('0 relancé · 1 passé · 1 sauté');
    expect(within(recap).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Locataire 1déjà payée']);
    expect(liens()).toEqual([]);
    await utilisateur.click(screen.getByRole('button', { name: 'Terminer' }));
    await waitFor(() => expect(file()).toBeNull());
    expect(screen.getByRole('checkbox', { name: 'Sélectionner l’impayé de Locataire 1' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Sélectionner l’impayé de Locataire 2' })).toBeChecked();
  });

  it('pendant la file, les cases sont figées et le dossier d’une rangée ne s’ouvre pas', async () => {
    lignes = [ligne(1, 40), ligne(2, 30)];
    const utilisateur = rendre();
    await screen.findByRole('button', { name: 'Ouvrir le dossier de Locataire 2' });
    await cocherAuBureau(utilisateur, 'Locataire 1');
    await relancerAuBureau(utilisateur);
    await boutonDe('1');

    // Une case cliquée pendant la file ne change pas la sélection que la file parcourt.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sélectionner l’impayé de Locataire 2' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sélectionner l’impayé de Locataire 1' }));
    expect(screen.getByRole('checkbox', { name: 'Sélectionner l’impayé de Locataire 1' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Sélectionner l’impayé de Locataire 2' })).not.toBeChecked();
    expect(barreDeSelection()).toHaveTextContent('1 sélectionné');
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le dossier de Locataire 2' }));
    expect(screen.queryByRole('dialog', { name: 'Locataire 2' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
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

  it('la tête de sélection du téléphone dit aussi ce qui n’est pas affiché', async () => {
    lignes = [ligne(1, 40), ligne(2, 3)];
    const utilisateur = rendre();
    await screen.findByRole('article', { name: 'Locataire 2' });
    await utilisateur.click(screen.getByRole('button', { name: 'Sélectionner des impayés à relancer' }));
    await utilisateur.click(screen.getByRole('checkbox', { name: 'Sélectionner l’impayé de Locataire 1' }));
    const tete = () => document.querySelector<HTMLElement>('[data-slot="tete-de-selection"]')!;
    expect(tete()).not.toHaveTextContent('non affiché');

    await utilisateur.click(screen.getByRole('button', { name: /Moins de 8 j/ }));
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Locataire 1' })).not.toBeInTheDocument());
    expect(within(tete()).getByText('dont 1 non affiché')).toBeInTheDocument();
    expect(tete()).toHaveTextContent('1 sélectionné');
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
    expect(await within(pied as HTMLElement).findByRole('button', { name: /Ouvrir WhatsApp/ })).toBeInTheDocument();
    // Décision 1 — présenter l'échéance ne crée pas son lien.
    expect(liens()).toEqual([]);
  });
});
