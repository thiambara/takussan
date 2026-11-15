/**
 * TCK-2662 — « Commissions : le solde d'abord ». Une route, deux lectures (l'agent : « On vous doit »
 * et ses lignes ; qui lit tout le grand livre : un solde par agent et « Solder »), et des gestes
 * d'argent qui ne se font plus en un clic.
 *
 * Le réseau est doublé au niveau de `fetch` : les requêtes sont lues telles que l'API les reçoit
 * (filtres, `include`, corps des POST).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';

import { Commissions } from '../Commissions';

const etat = vi.hoisted(() => ({ query: '', replace: vi.fn(), telephone: false, moi: 1 }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: etat.replace, push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(etat.query),
  usePathname: () => '/app/commissions',
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton', user: { id: etat.moi } }) }));
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: () => etat.telephone }));

const ANNEE = new Date().toISOString().slice(0, 4);
const T = fr.commissions;

type Ligne = Record<string, unknown> & { id: number; status: string; beneficiary_id: number };

const bien = (title: string | null, quarter: string | null) => ({ id: 7, reference_number: 'LS-2026-0042', type: 'residential_rent', property: title === null ? null : { id: 9, title, quarter } });

const ligne = (id: number, extra: Partial<Ligne> = {}): Ligne => ({
  id,
  agency_id: 3,
  lease_id: 40 + id,
  beneficiary_id: 2,
  origin: 'negotiator',
  base_amount: 725000,
  share_percent: 40,
  amount: 290000,
  currency: 'XOF',
  status: 'due',
  earned_at: `${ANNEE}-01-02T10:00:00Z`,
  paid_at: null,
  cancelled_at: null,
  payment_method: null,
  payment_reference: null,
  cancel_reason_code: null,
  cancel_reason: null,
  beneficiary: { id: 2, name: 'Sokhna Sène' },
  lease: bien('Appartement 3 ch.', 'Mermoz'),
  ...extra,
});

const DUES = [
  ligne(1),
  ligne(2, { amount: 514000, base_amount: 1285000, lease: bien('Villa 4 ch.', 'Almadies') }),
  ligne(3, { amount: 400000, base_amount: 2000000, share_percent: 20, origin: 'collaborator', lease: bien('Bureaux 180 m²', 'Plateau') }),
];
const PAYEE = ligne(4, { status: 'paid', amount: 1840000, paid_at: `${ANNEE}-01-05T10:00:00Z`, payment_method: 'wave', lease: bien('Villa 5 ch.', 'Ngor') });
const PAYEE_SANS_MOYEN = ligne(5, { status: 'paid', amount: 124000, paid_at: `${ANNEE}-01-05T10:00:00Z`, payment_method: null, lease: bien('Studio meublé', 'Fann') });
const ANNULEE = ligne(6, { status: 'cancelled', amount: 360000, cancelled_at: `${ANNEE}-01-03T10:00:00Z`, cancel_reason_code: 'lease_terminated_before_move_in', lease: bien('Maison 4 ch.', 'Ouakam') });
const MIENNE = ligne(8, { beneficiary_id: 1, beneficiary: { id: 1, name: 'Moi Même' }, lease: bien('Duplex', 'Ngor') });

const POINTS = [
  { beneficiary: { id: 2, name: 'Sokhna Sène' }, due_amount: 1204000, due_count: 3, oldest_due_earned_at: `${ANNEE}-01-02T10:00:00Z`, paid_month: 0, paid_year: 9286361, last_paid: { at: `${ANNEE}-01-05T10:00:00Z`, method: 'wave' } },
  { beneficiary: { id: 1, name: 'Moi Même' }, due_amount: 290000, due_count: 1, oldest_due_earned_at: `${ANNEE}-01-02T10:00:00Z`, paid_month: 0, paid_year: 0, last_paid: null },
  { beneficiary: { id: 5, name: 'Khady Diallo' }, due_amount: 0, due_count: 0, oldest_due_earned_at: null, paid_month: 388000, paid_year: 5104200, last_paid: { at: `${ANNEE}-01-04T10:00:00Z`, method: 'wave' } },
];

interface Appel {
  readonly url: string;
  readonly methode: string;
  readonly corps: unknown;
}

function routeur(capacites: string[], { lignes = [...DUES, PAYEE, ANNULEE, MIENNE], points = POINTS }: { lignes?: Ligne[]; points?: typeof POINTS } = {}) {
  const appels: Appel[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entree: RequestInfo | URL, init?: RequestInit) => {
      const url = decodeURIComponent(String(entree));
      const methode = init?.method ?? 'GET';
      appels.push({ url, methode, corps: typeof init?.body === 'string' ? JSON.parse(init.body) : null });
      let corps: unknown = {};
      if (url.includes('/api/me/capabilities')) corps = { data: { agency_id: 3, capabilities: capacites } };
      else if (url.includes('/api/commissions/summary')) corps = { data: points, meta: { month: `${ANNEE}-01`, year: ANNEE } };
      else if (methode === 'POST') corps = { data: [] };
      else if (url.includes('/api/commissions')) {
        const statut = /filter\[status\]=(\w+)/.exec(url)?.[1];
        const benef = /filter\[beneficiary_id\]=(\d+)/.exec(url)?.[1];
        const parPage = Number(/per_page=(\d+)/.exec(url)?.[1] ?? 20);
        const du = /filter\[earned_from\]=([\d-]+)/.exec(url)?.[1];
        const au = /filter\[earned_to\]=([\d-]+)/.exec(url)?.[1];
        const jour = (l: Ligne) => String(l.earned_at).slice(0, 10);
        const choisies = lignes.filter(
          (l) => (!statut || l.status === statut) && (!benef || l.beneficiary_id === Number(benef)) && (!du || jour(l) >= du) && (!au || jour(l) <= au),
        );
        const page = Number(/[?&]page=(\d+)/.exec(url)?.[1] ?? 1);
        corps = {
          data: choisies.slice(0, parPage),
          meta: { current_page: page, last_page: Math.max(1, Math.ceil(choisies.length / parPage)), per_page: parPage, total: choisies.length, totals: { due: 0, paid: 0, cancelled: 0 } },
        };
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => corps, text: async () => JSON.stringify(corps) };
    }),
  );
  return appels;
}

// Les lectures de liste : ni les comptes des puces (`per_page=1`), ni le montant annulé (deux colonnes).
const lectures = (appels: Appel[]) =>
  appels.filter((a) => a.methode === 'GET' && a.url.includes('/api/commissions?') && !a.url.includes('per_page=1&') && !/per_page=1$/.test(a.url) && !a.url.includes('fields[commission_entries]=id,amount,currency'));
const envois = (appels: Appel[], fin: string) => appels.filter((a) => a.methode === 'POST' && a.url.includes(fin));

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}><Commissions /></QueryClientProvider>));
}

beforeEach(() => {
  etat.query = '';
  etat.replace.mockReset();
  etat.telephone = false;
  etat.moi = 1;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('TCK-2662 — la lecture choisie selon l’appelant', () => {
  it('l’agent (sans capacité de lecture du grand livre) : « Mes commissions », « On vous doit », ses lignes avec le bien', async () => {
    etat.moi = 2;
    const appels = routeur([]);
    rendre();

    expect(await screen.findByRole('heading', { level: 1, name: T.titreAgent })).toBeInTheDocument();
    const carte = await screen.findByText(T.agent.onVousDoit);
    await waitFor(() => expect(carte.parentElement).toHaveTextContent(/1\s204\s000/));
    expect(carte.parentElement).toHaveTextContent('3 baux');
    // Les lignes portent le bien et son quartier : `include=lease.property`.
    await waitFor(() => expect(lectures(appels).length).toBeGreaterThan(0));
    expect(lectures(appels)[0].url).toContain('include=lease.property,beneficiary');
    expect(appels.some((a) => a.url.includes('/api/commissions/summary'))).toBe(true);
    // Ni « Solder » ni menu « … » pour l'agent.
    expect(screen.queryByRole('button', { name: /^Solder/ })).toBeNull();
    expect(screen.queryByRole('button', { name: new RegExp(T.menu.actions) })).toBeNull();
  });

  it('qui lit tout le grand livre : « Commissions », un solde par agent, la ligne de total', async () => {
    routeur(['reports.view_agency', 'payouts.approve']);
    rendre();

    expect(await screen.findByRole('heading', { level: 1, name: T.titreAdmin })).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: T.tableAgents });
    expect(within(table).getByText('Sokhna Sène')).toBeInTheDocument();
    expect(within(table).getByText(T.admin.total)).toBeInTheDocument();
    // Le dû de Sokhna, et le sous-titre : dus à 2 agents (Khady est à jour).
    expect(screen.getByText(/dus à 2 agents/)).toBeInTheDocument();
  });

  it('`payouts.approve` seul ouvre aussi le grand livre (qui solde voit ce qu’il solde)', async () => {
    routeur(['payouts.approve']);
    rendre();
    expect(await screen.findByRole('heading', { level: 1, name: T.titreAdmin })).toBeInTheDocument();
  });
});

describe('TCK-2662 — AC5 : aucun geste sans `payouts.approve`, jamais sur sa propre ligne', () => {
  it('`reports.view_agency` sans `payouts.approve` : ni « Solder », ni menu « … »', async () => {
    routeur(['reports.view_agency']);
    rendre();
    await screen.findByRole('table', { name: T.tableAgents });
    expect(screen.queryByRole('button', { name: /^Solder/ })).toBeNull();

    etat.query = 'vue=lignes';
    rendre();
    await screen.findByRole('table', { name: T.tableLignes });
    expect(screen.queryByRole('button', { name: new RegExp(T.menu.actions) })).toBeNull();
  });

  it('avec `payouts.approve` : « Solder » pour les autres, pas pour soi ; le menu sur leurs lignes dues, pas sur la sienne', async () => {
    routeur(['reports.view_agency', 'payouts.approve']);
    rendre();
    await screen.findByRole('table', { name: T.tableAgents });
    expect(screen.getByRole('button', { name: 'Solder Sokhna Sène' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Solder Moi Même' })).toBeNull();

    etat.query = 'vue=lignes';
    const { unmount } = rendre();
    const table = await screen.findAllByRole('table', { name: T.tableLignes });
    const menus = within(table.at(-1) as HTMLElement).getAllByRole('button', { name: new RegExp(T.menu.actions) });
    // Trois lignes dues de Sokhna ; ni la payée, ni l'annulée, ni la mienne.
    expect(menus).toHaveLength(3);
    expect(menus.some((m) => m.getAttribute('aria-label')?.includes('Duplex'))).toBe(false);
    unmount();
  });
});

describe('TCK-2662 — AC3 : solder envoie les seules lignes cochées', () => {
  it('décocher une ligne sur trois : `entry_ids` à deux éléments, et le bouton annonce leur somme', async () => {
    etat.query = 'solder=2';
    const appels = routeur(['reports.view_agency', 'payouts.approve']);
    rendre();

    const dialogue = await screen.findByRole('dialog', { name: 'Solder Sokhna Sène' });
    await within(dialogue).findByText('Villa 4 ch. · Almadies');
    // Les dues du bénéficiaire, les plus anciennes d'abord, au plus 100.
    const lecture = lectures(appels).find((a) => a.url.includes('filter[beneficiary_id]=2'));
    expect(lecture?.url).toContain('filter[status]=due');
    expect(lecture?.url).toContain('sort=earned_at');
    expect(lecture?.url).toContain('per_page=100');

    await userEvent.click(within(dialogue).getByRole('checkbox', { name: /^Villa 4 ch\. · Almadies/ }));
    const confirmer = within(dialogue).getByRole('button', { name: /^Confirmer le paiement de 690\s000/ });
    // Wave : la référence est exigée.
    expect(confirmer).toBeDisabled();
    await userEvent.type(within(dialogue).getByLabelText(T.payer.reference), 'WV-7Q2MX41');
    expect(confirmer).toBeEnabled();
    await userEvent.click(confirmer);

    await waitFor(() => expect(envois(appels, '/api/commissions/settle')).toHaveLength(1));
    const corps = envois(appels, '/api/commissions/settle')[0].corps as Record<string, unknown>;
    expect(corps.beneficiary_id).toBe(2);
    expect(corps.entry_ids).toEqual([1, 3]);
    expect(corps.payment_method).toBe('wave');
    expect(corps.payment_reference).toBe('WV-7Q2MX41');
    expect(corps.paid_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('pas de solde de sa propre ligne, même par l’URL', async () => {
    etat.query = 'solder=1';
    routeur(['reports.view_agency', 'payouts.approve']);
    rendre();
    await screen.findByRole('table', { name: T.tableAgents });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('TCK-2662 — AC4 : annuler exige un motif, « Autre » un texte', () => {
  it('le bouton reste inactif sans motif, puis avec « Autre » vide ; il envoie le motif et sa précision', async () => {
    etat.query = 'vue=lignes&status=due';
    const appels = routeur(['reports.view_agency', 'payouts.approve']);
    rendre();

    const menus = await screen.findAllByRole('button', { name: new RegExp(`${T.menu.actions} — Bureaux`) });
    await userEvent.click(menus[0]);
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(T.menu.annuler) }));

    const dialogue = await screen.findByRole('dialog', { name: T.annuler.titre });
    const annuler = within(dialogue).getByRole('button', { name: /^Annuler 400\s000/ });
    expect(annuler).toBeDisabled();
    await userEvent.click(within(dialogue).getByRole('radio', { name: T.motifs.other }));
    expect(annuler).toBeDisabled();
    await userEvent.type(within(dialogue).getByRole('textbox', { name: T.annuler.precision }), 'Doublon de saisie');
    expect(annuler).toBeEnabled();
    await userEvent.click(annuler);

    await waitFor(() => expect(envois(appels, '/api/commissions/3/cancel')).toHaveLength(1));
    expect(envois(appels, '/api/commissions/3/cancel')[0].corps).toEqual({ reason_code: 'other', reason: 'Doublon de saisie' });
  });

  it('un motif de la liste suffit, sans texte', async () => {
    etat.query = 'vue=lignes&status=due';
    const appels = routeur(['reports.view_agency', 'payouts.approve']);
    rendre();
    const menus = await screen.findAllByRole('button', { name: new RegExp(`${T.menu.actions} — Bureaux`) });
    await userEvent.click(menus[0]);
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(T.menu.annuler) }));
    const dialogue = await screen.findByRole('dialog', { name: T.annuler.titre });
    await userEvent.click(within(dialogue).getByRole('radio', { name: T.motifs.wrong_beneficiary }));
    await userEvent.click(within(dialogue).getByRole('button', { name: /^Annuler 400\s000/ }));
    await waitFor(() => expect(envois(appels, '/api/commissions/3/cancel')[0]?.corps).toEqual({ reason_code: 'wrong_beneficiary', reason: null }));
  });
});

describe('TCK-2662 — « Marquer payée » : la preuve, plus jamais un clic', () => {
  it('en espèces, la référence est facultative ; le corps porte la date, le moyen, une référence nulle', async () => {
    etat.query = 'vue=lignes&status=due';
    const appels = routeur(['reports.view_agency', 'payouts.approve']);
    rendre();
    const menus = await screen.findAllByRole('button', { name: new RegExp(`${T.menu.actions} — Appartement`) });
    await userEvent.click(menus[0]);
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(T.markPaid) }));
    // Le menu ne paie rien : il ouvre la preuve.
    expect(envois(appels, '/mark-paid')).toHaveLength(0);

    const dialogue = await screen.findByRole('dialog', { name: T.payer.titreLigne });
    await userEvent.click(within(dialogue).getByRole('radio', { name: T.moyens.cash }));
    await userEvent.click(within(dialogue).getByRole('button', { name: /^Confirmer le paiement de 290\s000/ }));
    await waitFor(() => expect(envois(appels, '/api/commissions/1/mark-paid')).toHaveLength(1));
    const corps = envois(appels, '/api/commissions/1/mark-paid')[0].corps as Record<string, unknown>;
    expect(corps).toMatchObject({ payment_method: 'cash', payment_reference: null });
    expect(corps.paid_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('TCK-2662 — la carte du téléphone (AC2)', () => {
  it('le bien en titre, jamais la référence du bail ; la part en clair ; le rôle et la date', async () => {
    etat.telephone = true;
    etat.moi = 2;
    routeur([]);
    rendre();
    const titre = await screen.findByRole('link', { name: 'Appartement 3 ch. · Mermoz' });
    const carte = titre.closest('[data-slot="carte-commission"]') as HTMLElement;
    expect(carte).toHaveTextContent(/40\s%\sde\s725\s000\sF · négociateur · 2 janv\./);
    expect(document.body.textContent).not.toContain('LS-2026-0042');
  });

  it('un titre qui nomme déjà son quartier ne le répète pas', async () => {
    etat.telephone = true;
    etat.moi = 2;
    routeur([], { lignes: [ligne(9, { lease: bien('Villa contemporaine – Hann Maristes 1', 'Hann Maristes 1') })] });
    rendre();
    expect(await screen.findByRole('link', { name: 'Villa contemporaine – Hann Maristes 1' })).toBeInTheDocument();
  });

  it('payée sans moyen connu : « payée le … » sans séparateur orphelin ; annulée : le motif, le montant barré', async () => {
    etat.telephone = true;
    etat.moi = 2;
    etat.query = 'status=toutes';
    routeur([], { lignes: [PAYEE, PAYEE_SANS_MOYEN, ANNULEE] });
    rendre();
    const sansMoyen = (await screen.findByRole('link', { name: 'Studio meublé · Fann' })).closest('[data-slot="carte-commission"]') as HTMLElement;
    expect(sansMoyen.textContent).toMatch(/payée le 5 janv\.$/);
    const avecMoyen = screen.getByRole('link', { name: 'Villa 5 ch. · Ngor' }).closest('[data-slot="carte-commission"]') as HTMLElement;
    expect(avecMoyen.textContent).toMatch(/payée le 5 janv\. · Wave$/);
    const annulee = screen.getByRole('link', { name: 'Maison 4 ch. · Ouakam' }).closest('[data-slot="carte-commission"]') as HTMLElement;
    expect(annulee).toHaveTextContent(`annulée · ${T.motifs.lease_terminated_before_move_in}`);
    expect(within(annulee).getByText(/360\s000/)).toHaveClass('line-through');
  });

  it('sans bien lisible, un repli — pas la référence du bail', async () => {
    etat.telephone = true;
    etat.moi = 2;
    routeur([], { lignes: [ligne(1, { lease: bien(null, null) })] });
    rendre();
    expect(await screen.findByRole('link', { name: T.ligne.sansBien })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('LS-2026-0042');
  });
});

describe('TCK-2662 — AC6 : « Relevé » télécharge le relevé de l’année', () => {
  it('le lien vise l’export des commissions de l’année, en téléchargement', async () => {
    etat.telephone = true;
    etat.moi = 2;
    routeur([]);
    rendre();
    const lien = await screen.findByRole('link', { name: `Télécharger mon relevé de ${ANNEE}` });
    expect(lien).toHaveAttribute('download');
    expect(lien.getAttribute('href')).toBe(`/api/export/commissions?format=csv&from=${ANNEE}-01-01&to=${ANNEE}-12-31`);
  });
});

describe('TCK-2662 — la vue dans l’URL (TCK-1732, reprise)', () => {
  it('ouvre la vue que porte l’URL : statut et page', async () => {
    etat.query = 'status=paid&page=2';
    etat.moi = 2;
    const appels = routeur([]);
    rendre();
    await waitFor(() => expect(lectures(appels).some((a) => a.url.includes('page=2'))).toBe(true));
    const lecture = lectures(appels).find((a) => a.url.includes('page=2'));
    expect(lecture?.url).toContain('filter[status]=paid');
    expect(screen.getByRole('button', { name: /^Payées/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('bureau : « Dues » par défaut aussi (décision 4 b) ; un statut inconnu y revient', async () => {
    for (const query of ['', 'status=bidon']) {
      etat.query = query;
      etat.moi = 2;
      const appels = routeur([]);
      const { unmount } = rendre();
      await waitFor(() => expect(lectures(appels).some((a) => a.url.includes('filter[status]=due') && a.url.includes('per_page=20'))).toBe(true));
      expect(screen.getByRole('button', { name: /^Dues/ })).toHaveAttribute('aria-pressed', 'true');
      expect(lectures(appels).some((a) => a.url.includes('per_page=20') && !a.url.includes('filter[status]'))).toBe(false);
      unmount();
    }
  });

  it('un `status` explicite l’emporte au bureau ; le choix s’écrit dans l’URL et revient à la page 1', async () => {
    etat.query = 'status=paid&page=2';
    etat.moi = 2;
    const appels = routeur([]);
    rendre();
    expect(await screen.findByRole('button', { name: /^Payées/ })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(lectures(appels).some((a) => a.url.includes('filter[status]=paid') && a.url.includes('page=2'))).toBe(true));
    await userEvent.click(screen.getByRole('button', { name: /^Annulées/ }));
    expect(etat.replace).toHaveBeenCalledWith('?status=cancelled', { scroll: false });
    await userEvent.click(screen.getByRole('button', { name: /^Toutes/ }));
    expect(etat.replace).toHaveBeenCalledWith('?status=toutes', { scroll: false });
  });

  it('le total annulé de l’ancien grand livre, à côté des puces, au bureau comme au téléphone (décision 7 b)', async () => {
    for (const telephone of [false, true]) {
      etat.telephone = telephone;
      etat.moi = 2;
      const appels = routeur([]);
      const { unmount } = rendre();
      const montant = await screen.findByText(/^Annulé : 360\s000\sF$/);
      expect(montant).toHaveAttribute('data-slot', 'montant-annule');
      // Lu avec les filtres des puces, statut « annulée » : deux colonnes, pas `meta.totals` (toute la portée).
      expect(appels.some((a) => a.url.includes('filter[status]=cancelled') && a.url.includes('fields[commission_entries]=id,amount,currency'))).toBe(true);
      unmount();
    }
  });

  it('aucune ligne annulée : pas de « Annulé : 0 F »', async () => {
    etat.moi = 2;
    routeur([], { lignes: [...DUES, PAYEE] });
    rendre();
    await screen.findByRole('button', { name: /^Annulées/ });
    await waitFor(() => expect(screen.getByRole('button', { name: /^Annulées/ })).toHaveTextContent('0'));
    expect(document.querySelector('[data-slot="montant-annule"]')).toBeNull();
  });

  it('téléphone : « Dues » par défaut ; « Toutes » s’écrit `status=toutes`', async () => {
    etat.telephone = true;
    etat.moi = 2;
    const appels = routeur([]);
    rendre();
    await waitFor(() => expect(lectures(appels).some((a) => a.url.includes('filter[status]=due') && a.url.includes('per_page=20'))).toBe(true));
    expect(screen.getByRole('button', { name: /^Dues/ })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: /^Toutes/ }));
    expect(etat.replace).toHaveBeenCalledWith('?status=toutes', { scroll: false });
  });
});

describe('TCK-2662 (reprise) — une même URL, un même résultat à toute largeur', () => {
  const ANCIENNE = ligne(9, { status: 'paid', amount: 50000, earned_at: `${Number(ANNEE) - 1}-11-02T10:00:00Z`, paid_at: `${Number(ANNEE) - 1}-11-20T10:00:00Z`, payment_method: 'wave', lease: bien('Chambre', 'Yoff') });
  const lignesDeLAgent = [...DUES, PAYEE, ANNULEE, ANCIENNE].map((l) => ({ ...l, beneficiary_id: 2 }));

  const comptesLus = () =>
    ['Dues', 'Payées', 'Annulées', 'Toutes'].map((nom) => screen.getByRole('button', { name: new RegExp(`^${nom}`) }).textContent?.replace(/\D/g, ''));

  it('à 390 comme à 1440, l’URL par défaut borne les puces à l’année en cours ; `periode=tout` la lève partout', async () => {
    for (const [query, attendu] of [
      ['', ['3', '1', '1', '5']],
      ['periode=tout', ['3', '2', '1', '6']],
    ] as const) {
      const lus: string[][] = [];
      for (const telephone of [true, false]) {
        etat.telephone = telephone;
        etat.moi = 2;
        etat.query = query;
        routeur([], { lignes: lignesDeLAgent });
        const { unmount } = rendre();
        await waitFor(() => expect(comptesLus()).toEqual(attendu));
        lus.push(comptesLus() as string[]);
        unmount();
      }
      expect(lus[0]).toEqual(lus[1]);
    }
  });

  it('le téléphone dit la période qui borne ses comptes, et la change', async () => {
    etat.telephone = true;
    etat.moi = 2;
    routeur([], { lignes: lignesDeLAgent });
    rendre();
    const periode = await screen.findByRole('button', { name: `${T.agent.periode.replace('{periode}', T.agent.depuisJanvier)}` });
    expect(periode).toHaveTextContent(T.agent.depuisJanvier);
    await userEvent.click(periode);
    await userEvent.click(await screen.findByRole('menuitem', { name: T.agent.toutesLesDates }));
    expect(etat.replace).toHaveBeenCalledWith('?periode=tout', { scroll: false });
  });
});

describe('TCK-2662 (reprise) — les annulées au-delà de la lecture (G6, G7)', () => {
  it('150 annulées, 100 lues : la puce compte 150 (meta.total) et le montant se dit « au moins »', async () => {
    etat.moi = 2;
    const annulees = Array.from({ length: 150 }, (_, i) => ligne(100 + i, { status: 'cancelled', amount: 10000, cancelled_at: `${ANNEE}-01-03T10:00:00Z` }));
    routeur([], { lignes: [...DUES, ...annulees] });
    rendre();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Annulées/ })).toHaveTextContent('150'));
    // 100 lignes lues × 10 000 : un plancher, jamais un total.
    expect(await screen.findByText(/^Annulé : au moins 1\s000\s000\sF$/)).toHaveAttribute('data-slot', 'montant-annule');
  });
});

describe('TCK-2662 (reprise) — le premier rendu ne dépend pas des capacités en cache', () => {
  it('rendu serveur sans capacités, hydratation avec les capacités amorcées : même arbre, aucune erreur d’hydratation', async () => {
    etat.moi = 2;
    routeur([]);
    const arbre = (client: QueryClient) => withIntl(<QueryClientProvider client={client}><Commissions /></QueryClientProvider>);
    const amorce = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    amorce.setQueryData(['me', 'capabilities', 'active'], { data: { agency_id: 3, capabilities: [] } });

    // Le serveur, même avec un cache amorcé, rend le squelette : le premier rendu ne lit pas les capacités.
    expect(renderToString(arbre(amorce))).toContain('data-testid="route-skeleton"');
    const html = renderToString(arbre(new QueryClient({ defaultOptions: { queries: { retry: false } } })));

    const conteneur = document.createElement('div');
    conteneur.innerHTML = html;
    document.body.appendChild(conteneur);
    const erreurs: unknown[] = [];
    await act(async () => {
      hydrateRoot(conteneur, arbre(amorce), { onRecoverableError: (e) => erreurs.push(e) });
    });
    expect(erreurs).toEqual([]);
    // Puis, hydraté, la vue de l'agent.
    await waitFor(() => expect(within(conteneur).getByRole('heading', { name: T.titreAgent })).toBeInTheDocument());
    conteneur.remove();
  });
});

