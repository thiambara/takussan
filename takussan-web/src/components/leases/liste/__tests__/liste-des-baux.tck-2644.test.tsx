/**
 * TCK-2644 — la liste des baux de l'agence : la file « À traiter » qui nomme le locataire, ses onglets
 * comptés par UN appel, un geste par carte, et la relance d'un impayé par WhatsApp.
 *
 * Le réseau est un faux serveur derrière `apiRequest` : chaque requête est relevée comme on la lirait
 * dans l'onglet Réseau (AC1, AC2, AC4). La relance passe par la vraie feuille de TCK-2660 et par la
 * vraie action serveur qui compose le message.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createTranslator } from 'next-intl';
import { useSyncExternalStore, type ReactElement } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import { withIntl } from '@/test/intl';
import type { BailDeLaListe, EntreeDAttention } from '@/lib/queries/leases-file';
import type { PaymentHistoryRow } from '@/types/invoice';

const DICTIONNAIRES = { fr, en, wo } as const;
const LIEN = 'https://www.takussan.com/pay/k7Qm2xR9';
const L = fr.lease.liste;

const reseau = vi.hoisted(() => ({ appels: [] as { chemin: string; methode: string; corps: unknown }[] }));
const toastAdd = vi.hoisted(() => vi.fn());
const nav = vi.hoisted(() => {
  let query = '';
  const abonnes = new Set<() => void>();
  return {
    get query() {
      return query;
    },
    poser(q: string) {
      query = q.replace(/^\?/, '');
      abonnes.forEach((f) => f());
    },
    abonner(f: () => void) {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
  };
});

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(useSyncExternalStore(nav.abonner, () => nav.query, () => nav.query)),
  useRouter: () => ({ replace: (url: string) => nav.poser(url.split('?')[1] ?? ''), push: vi.fn() }),
  usePathname: () => '/app/leases',
}));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: toastAdd }) }));
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

const RESUME = {
  a_traiter: 9,
  active: 61,
  onboarding_pending: 2,
  ended: 14,
  draft: 2,
  motifs: { signature_pending: 1, notice_received: 1, rent_late: 2, late_fee_unpaid: 1, rent_review_open: 1, deposit_to_refund: 1, ending_soon: 1, onboarding_incomplete: 1 },
};

const AUJOURDHUI = new Date();
const ilYA = (jours: number) => new Date(AUJOURDHUI.getTime() - jours * 86_400_000).toISOString().slice(0, 10);

function bail(id: number, entree: EntreeDAttention | null, extra: Partial<BailDeLaListe> = {}): BailDeLaListe {
  return {
    id,
    reference_number: `LS-${id}`,
    type: 'residential_rent',
    status: 'active',
    start_date: '2025-07-01',
    end_date: '2029-06-30',
    monthly_rent: 1_355_000,
    sale_price: null,
    currency: 'XOF',
    signed_at: '2025-06-20T10:00:00Z',
    property_id: 200 + id,
    tenant_id: 300 + id,
    landlord_id: 50,
    agent_id: 5,
    tenant: { id: 300 + id, first_name: 'Mamadou', last_name: `Seck${id}`, phone: '+221771234567', locale: null },
    property: { id: 200 + id, title: `Villa ${id}`, reference_number: null },
    agent: { id: 5, full_name: 'Moussa Diop' },
    attention: entree ? [entree] : [],
    overdue_count: entree?.motif === 'rent_late' ? 1 : 0,
    ...extra,
  } as BailDeLaListe;
}

const SECK = bail(1, { motif: 'rent_late', since: ilYA(6), amount: 1_355_000, due_date: '2026-11-05' });

let baux: BailDeLaListe[] = [];
let listesDEntree: { id: number; lease_id: number; created_at: string; welcome_seen_at: string | null; inventory_completed_at: string | null; first_payment_at: string | null; documents_acknowledged_at: string | null }[] = [];
let echeances: PaymentHistoryRow[] = [];

function echeance(id: number, bailId: number): PaymentHistoryRow {
  return {
    source: 'lease',
    id,
    reference_number: `LP-${id}`,
    amount: 1_355_000,
    currency: 'XOF',
    payment_method: null,
    payment_type: 'rent',
    status: 'late',
    paid_amount: 0,
    remaining_amount: 1_355_000,
    amount_due: 1_355_000,
    late_fee_amount: null,
    date: '2026-11-05T00:00:00Z',
    paid_at: null,
    period_start: '2026-11-01',
    period_end: '2026-11-30',
    due_date: '2026-11-05',
    booking_id: null,
    lease_id: bailId,
    property_id: 200 + bailId,
    customer_id: 300 + bailId,
    created_at: '2026-10-01T00:00:00Z',
    days_late: 6,
    payer: { id: 300 + bailId, name: 'Mamadou Seck', phone: '+221771234567', first_name: 'Mamadou', locale: null },
    property: { id: 200 + bailId, title: `Villa ${bailId}`, reference_number: null },
    last_reminder: null,
    reminders_count: 0,
  } as PaymentHistoryRow;
}

vi.mock('@/lib/api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...reel,
    apiRequest: async (chemin: string, options: { method?: string; body?: unknown } = {}) => {
      const methode = options.method ?? 'GET';
      reseau.appels.push({ chemin, methode, corps: options.body });
      const url = new URL(chemin, 'http://api.test');
      if (url.pathname === '/api/leases/summary') return { data: RESUME };
      if (url.pathname === '/api/leases') {
        return { data: baux, meta: { current_page: 1, last_page: 1, per_page: 30, total: baux.length } };
      }
      if (url.pathname === '/api/agencies/1/tenant-onboarding-pending') return { data: listesDEntree, meta: { current_page: 1, last_page: 1, per_page: 100, total: listesDEntree.length } };
      if (url.pathname === '/api/payments/history') return { data: echeances, meta: { current_page: 1, last_page: 1, per_page: 20, total: echeances.length } };
      if (url.pathname === '/api/agencies/1/members') {
        return { data: [{ id: 4, first_name: 'Sokhna', last_name: 'Sène' }, { id: 5, first_name: 'Pape', last_name: 'Cissé' }], meta: { current_page: 1, last_page: 1, per_page: 100, total: 2 } };
      }
      if (url.pathname === '/api/properties') return { data: [], meta: { current_page: 1, last_page: 1, per_page: 8, total: 0 } };
      if (/^\/api\/lease-payments\/\d+\/payment-link$/.test(url.pathname) && methode === 'POST') return { data: { url: LIEN, expires_at: null } };
      const relance = /^\/api\/lease-payments\/(\d+)\/reminders$/.exec(url.pathname);
      if (relance && methode === 'POST') {
        return { data: { id: 1, at: new Date().toISOString(), source: 'manual', channel: (options.body as { channel: string }).channel, by: { id: 9, name: 'Sokhna Sène' }, note: null, milestone: null } };
      }
      if (/^\/api\/leases\/\d+\/signature-request$/.test(url.pathname) && methode === 'POST') return { data: {} };
      throw new Error(`requête inattendue : ${methode} ${chemin}`);
    },
  };
});

const { LeasesList } = await import('@/components/leases/LeasesList');

function rendre(ui: ReactElement = <LeasesList vue="agence" peutCreer agencyId={1} />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utilisateur = userEvent.setup();
  render(withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>));
  return utilisateur;
}

const requetes = (chemin: string) =>
  reseau.appels.filter((a) => new URL(a.chemin, 'http://api.test').pathname === chemin).map((a) => new URL(a.chemin, 'http://api.test').searchParams);
const telephone = () => document.querySelector<HTMLElement>('[data-slot="liste-du-telephone"]')!;
const bureau = () => document.querySelector<HTMLElement>('[data-slot="liste-du-bureau"]')!;
const carte = async (nom: string) => (await within(telephone()).findByRole('link', { name: nom })).closest<HTMLElement>('[data-slot="carte-d-attente"]')!;

type FausseFenetre = { opener: unknown; location: { href: string }; close: () => void };
const fenetres: FausseFenetre[] = [];
function empecherLaNavigation(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('a[href^="https://wa.me"]')) e.preventDefault();
}

beforeEach(() => {
  reseau.appels.length = 0;
  toastAdd.mockClear();
  nav.poser('');
  baux = [SECK];
  listesDEntree = [];
  echeances = [echeance(507, 1)];
  fenetres.length = 0;
  document.addEventListener('click', empecherLaNavigation, true);
  vi.spyOn(window, 'open').mockImplementation(() => {
    const f: FausseFenetre = { opener: {}, location: { href: '' }, close: () => undefined };
    fenetres.push(f);
    return f as unknown as Window;
  });
});
afterEach(() => {
  document.removeEventListener('click', empecherLaNavigation, true);
  vi.mocked(window.open).mockRestore();
});

// La feuille de relance est chargée par `next/dynamic` : sa première importation (le module
// d'`Impayes` entier) coûte plusieurs secondes sous charge. La chauffer ici sort ce coût du cas AC1.
beforeAll(async () => {
  await import('@/components/admin/finances/impayes/Impayes');
}, 30000);

describe('TCK-2644 — la file « À traiter » de l’agence', () => {
  it('AC2 — les onglets portent les comptes de `GET /api/leases/summary`, lus en UN appel', async () => {
    rendre();
    const onglets = await screen.findByRole('tablist', { name: L.onglets.label });
    await waitFor(() => expect(within(onglets).getByRole('tab', { name: new RegExp(`${L.onglets.a_traiter}\\s*9`) })).toBeInTheDocument());
    expect(within(onglets).getByRole('tab', { name: new RegExp(`${L.onglets.actifs}\\s*61`) })).toBeInTheDocument();
    expect(within(onglets).getByRole('tab', { name: new RegExp(`${L.onglets.en_attente}\\s*2`) })).toBeInTheDocument();
    expect(within(onglets).getByRole('tab', { name: new RegExp(`${L.onglets.termines}\\s*14`) })).toBeInTheDocument();
    // Les pastilles du téléphone lisent la même réponse.
    const puces = screen.getByRole('group', { name: L.onglets.label });
    expect(within(puces).getByRole('button', { name: new RegExp(`${L.onglets.a_traiter}.*9`) })).toBeInTheDocument();
    expect(requetes('/api/leases/summary')).toHaveLength(1);
    // La file : `filter[a_traiter]=1`, triée par gravité, avec les parties nommées.
    const liste = requetes('/api/leases').at(-1)!;
    expect(liste.get('filter[a_traiter]')).toBe('1');
    expect(liste.get('sort')).toBe('attention');
    expect(liste.get('include')).toBe('tenant,property,agent,attention,due_summary');
    // « 77 baux · 61 actifs · 9 demandent une action » : active + ended + draft.
    expect(screen.getByText('77 baux · 61 actifs · 9 demandent une action')).toBeInTheDocument();
  });

  it('chaque carte nomme le locataire et le bien, dit ce qui attend avec son âge, et porte EXACTEMENT un geste de 44 px', async () => {
    baux = [SECK, bail(2, { motif: 'ending_soon', since: ilYA(20), due_date: '2027-03-31' }, { end_date: '2027-03-31' })];
    rendre();
    const c = await carte('Mamadou Seck1');
    expect(within(c).getByText('Villa 1')).toBeInTheDocument();
    expect(within(c).getByText(/^Loyer de nov\. en retard · 1\s355\s000\sF$/)).toBeInTheDocument();
    expect(within(c).getByText('depuis 6 j')).toBeInTheDocument();
    for (const nom of ['Mamadou Seck1', 'Mamadou Seck2']) {
      const gestes = (await carte(nom)).querySelectorAll('[data-slot="geste-du-bail"]');
      expect(gestes, nom).toHaveLength(1);
      expect(gestes[0].className, nom).toContain('h-11');
    }
  });

  it('le tableau du bureau tait le montant de l’impayé (sa ligne porte le loyer), et le loyer s’y écrit sans « / mois »', async () => {
    rendre();
    await carte('Mamadou Seck1');
    const rangee = within(bureau()).getAllByRole('row').find((r) => within(r).queryByText('Mamadou Seck1'))!;
    expect(within(rangee).getByText('Loyer de nov. en retard')).toBeInTheDocument();
    expect(within(rangee).queryByText(/en retard ·/)).toBeNull();
    expect(rangee.textContent).not.toContain(fr.lease.liste.parMois);
  });

  it('le tableau du bureau GARDE le montant de plusieurs loyers en retard et de la pénalité : le loyer de la ligne ne le dit pas (décision du 2026-11-13, point 4)', async () => {
    baux = [
      bail(1, { motif: 'rent_late', since: ilYA(20), amount: 2_710_000, due_date: '2026-10-05' }, { overdue_count: 2 }),
      bail(6, { motif: 'late_fee_unpaid', since: ilYA(9), amount: 22_500, due_date: '2026-10-05' }),
    ];
    rendre();
    await carte('Mamadou Seck1');
    const rangee = (n: number) => within(bureau()).getAllByRole('row').find((r) => within(r).queryByText(`Mamadou Seck${n}`))!;
    expect(within(rangee(1)).getByText(/^2 loyers en retard · 2\s710\s000\sF$/)).toBeInTheDocument();
    expect(within(rangee(6)).getByText(/^Pénalité non réglée · 22\s500\sF$/)).toBeInTheDocument();
  });

  it('une page unique : pas de pagination au téléphone (la maquette n’en dessine pas), le compte et la pagination au bureau', async () => {
    rendre();
    await carte('Mamadou Seck1');
    expect(within(telephone()).queryByRole('button', { name: fr.console.pagination.next })).toBeNull();
    expect(within(bureau()).getByRole('button', { name: fr.console.pagination.next })).toBeInTheDocument();
  });

  it('la règle de la file est écrite sous la liste, en vouvoiement', async () => {
    rendre();
    await carte('Mamadou Seck1');
    expect(screen.getAllByText(L.regle)).toHaveLength(2);
  });

  describe('un geste par motif', () => {
    it('préavis reçu → « Programmer l’état des lieux », vers la sortie', async () => {
      baux = [bail(3, { motif: 'notice_received', since: ilYA(2) }, { status: 'terminating', early_termination_effective_date: '2026-12-31' })];
      rendre();
      const c = await carte('Mamadou Seck3');
      expect(within(c).getByText('Préavis reçu · sortie le 31 déc.')).toBeInTheDocument();
      expect(within(c).getByText('reçu il y a 2 j')).toBeInTheDocument();
      expect(within(c).getByRole('link', { name: L.gestes.notice_received })).toHaveAttribute('href', '/app/inventories/new?lease=3&type=move_out');
    });

    it.each([
      ['rent_review_open', 'reviser', L.gestes.rent_review_open, 'Révision de loyer possible'],
      ['ending_soon', 'renouveler', L.gestes.ending_soon, 'Fin du bail le 30 juin 2029'],
      ['deposit_to_refund', 'restituer', L.gestes.deposit_to_refund, /^Caution à restituer · sorti le /],
    ] as const)('%s → la fiche, feuille ouverte (`?geste=%s`)', async (motif, geste, libelle, quoi) => {
      baux = [bail(4, { motif, since: '2026-11-01', amount: motif === 'deposit_to_refund' ? 500_000 : undefined })];
      rendre();
      const c = await carte('Mamadou Seck4');
      expect(within(c).getByText(quoi)).toBeInTheDocument();
      expect(within(c).getByRole('link', { name: libelle })).toHaveAttribute('href', `/app/leases/4?geste=${geste}`);
    });

    it('signature qui traîne → « Relancer la signature » : POST …/signature-request', async () => {
      baux = [bail(5, { motif: 'signature_pending', since: ilYA(5) }, { status: 'pending_signature' })];
      const utilisateur = rendre();
      const c = await carte('Mamadou Seck5');
      expect(within(c).getByText(L.motifs.signature_pending)).toBeInTheDocument();
      expect(within(c).getByText('depuis 5 j')).toBeInTheDocument();
      await utilisateur.click(within(c).getByRole('button', { name: L.gestes.signature_pending }));
      await waitFor(() => expect(reseau.appels.some((a) => a.methode === 'POST' && a.chemin === '/api/leases/5/signature-request')).toBe(true));
      await waitFor(() => expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: L.relance.signatureRelancee, type: 'success' })));
    });

    it('pénalité non réglée → « Relancer » : l’échéancier de la fiche, déplié, où elle se marque réglée (décision du 2026-11-13, option b : pas de WhatsApp sans trace)', async () => {
      baux = [bail(6, { motif: 'late_fee_unpaid', since: ilYA(9), amount: 22_500, due_date: '2026-10-05' })];
      rendre();
      const c = await carte('Mamadou Seck6');
      expect(within(c).getByText(/^Pénalité non réglée · 22\s500\sF$/)).toBeInTheDocument();
      expect(within(c).getByRole('link', { name: L.gestes.late_fee_unpaid })).toHaveAttribute('href', '/app/leases/6?echeancier=toutes');
      const rangee = within(bureau()).getAllByRole('row').find((r) => within(r).queryByText('Mamadou Seck6'))!;
      expect(within(rangee).getByRole('link', { name: L.gestesCourts.late_fee_unpaid })).toHaveAttribute('href', '/app/leases/6?echeancier=toutes');
      expect(document.querySelector('a[href*="wa.me"]')).toBeNull();
      expect(reseau.appels.some((a) => a.chemin.includes('payment-link'))).toBe(false);
    });

    it('entrée incomplète → « Relancer le locataire » : WhatsApp dit ce qui manque, sans lien de paiement', async () => {
      baux = [bail(7, { motif: 'onboarding_incomplete', since: ilYA(12) })];
      listesDEntree = [{ id: 70, lease_id: 7, created_at: ilYA(12), welcome_seen_at: '2026-10-01', inventory_completed_at: null, first_payment_at: null, documents_acknowledged_at: '2026-10-01' }];
      rendre();
      const c = await carte('Mamadou Seck7');
      await waitFor(() => expect(within(c).getByText('2 étapes d’entrée manquantes')).toBeInTheDocument());
      expect(requetes('/api/agencies/1/tenant-onboarding-pending').at(-1)!.get('filter[lease_id]')).toBe('7');
      const href = new URL(within(c).getByRole('link', { name: L.gestes.onboarding_incomplete }).getAttribute('href')!);
      expect(href.searchParams.get('text')).toContain('il reste : valider l’état des lieux d’entrée, régler le premier paiement.');
      expect(href.searchParams.get('text')).not.toContain('http');
    });

    it('AC1 — impayé → « Relancer » : l’échéance de l’entrée, puis « Ouvrir WhatsApp » crée le lien, ouvre wa.me (novembre, 1 355 000, le lien) et NOTE la relance', async () => {
      const utilisateur = rendre();
      const c = await carte('Mamadou Seck1');
      await utilisateur.click(within(c).getByRole('button', { name: L.gestes.rent_late }));

      const historique = await waitFor(() => {
        const h = requetes('/api/payments/history').at(-1);
        expect(h).toBeDefined();
        return h!;
      });
      expect(historique.get('filter[entity_type]')).toBe('lease');
      expect(historique.get('filter[entity_id]')).toBe('1');
      expect(historique.get('filter[days_late_min]')).toBe('1');

      await utilisateur.click(await screen.findByRole('button', { name: /Ouvrir WhatsApp/ }, { timeout: 10000 }));
      await waitFor(() => expect(fenetres.some((f) => f.location.href !== '')).toBe(true));
      expect(reseau.appels.filter((a) => a.methode === 'POST' && a.chemin.endsWith('/payment-link')).map((a) => a.chemin)).toEqual(['/api/lease-payments/507/payment-link']);
      const href = new URL(fenetres.find((f) => f.location.href !== '')!.location.href);
      expect(`${href.origin}${href.pathname}`).toBe('https://wa.me/221771234567');
      const texte = href.searchParams.get('text')!;
      expect(texte).toContain('novembre');
      expect(texte).toMatch(/1\s355\s000/);
      expect(texte).toContain(LIEN);
      await waitFor(() =>
        expect(reseau.appels.find((a) => a.methode === 'POST' && a.chemin === '/api/lease-payments/507/reminders')?.corps).toEqual({ channel: 'whatsapp' }),
      );
    });

    it('AC6 — un locataire sans téléphone : « Copier le lien de paiement » et la raison, aucun lien wa.me', async () => {
      baux = [bail(8, { motif: 'rent_late', since: ilYA(6), amount: 1_355_000, due_date: '2026-11-05' }, { tenant: { id: 308, first_name: 'Awa', last_name: 'Ndiaye', phone: null } })];
      echeances = [echeance(508, 8)];
      const utilisateur = rendre();
      // Après `userEvent.setup()`, qui pose son propre presse-papiers.
      const ecrire = vi.fn(async () => undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: ecrire }, configurable: true });
      const c = await carte('Awa Ndiaye');
      const geste = within(c).getByRole('button', { name: L.relance.copierLeLien });
      expect(within(c).getByText(L.relance.sansTelephone)).toBeInTheDocument();
      expect(geste).toHaveAccessibleDescription(L.relance.sansTelephone);
      expect(c.querySelector('a[href^="https://wa.me"]')).toBeNull();
      expect(within(c).queryByRole('button', { name: L.gestes.rent_late })).toBeNull();

      await utilisateur.click(geste);
      await waitFor(() => expect(ecrire).toHaveBeenCalledWith(LIEN));
      expect(reseau.appels.some((a) => a.methode === 'POST' && a.chemin === '/api/lease-payments/508/payment-link')).toBe(true);
      expect(await within(c).findByRole('button', { name: L.relance.lienCopie })).toBeInTheDocument();
    });
  });

  it('AC4 — taper « seck » envoie `filter[search]=seck` à la liste ET aux comptes', async () => {
    const utilisateur = rendre();
    await carte('Mamadou Seck1');
    const champ = within(document.querySelector<HTMLElement>('.lg\\:hidden')!).getByRole('searchbox', { name: L.recherche });
    await utilisateur.type(champ, 'seck');
    await waitFor(() => expect(requetes('/api/leases').at(-1)!.get('filter[search]')).toBe('seck'), { timeout: 3000 });
    expect(requetes('/api/leases/summary').at(-1)!.get('filter[search]')).toBe('seck');
  });

  it('le filtre « Agent » (`?agent=`) : les agents de l’agence par leur nom, `filter[agent_id]` à la liste ET aux comptes', async () => {
    nav.poser('agent=5');
    const utilisateur = rendre();
    await carte('Mamadou Seck1');
    const membres = requetes('/api/agencies/1/members').at(-1)!;
    expect(membres.get('filter[role]')).toBe('agent');
    expect(membres.get('fields[users]')).toBe('id,first_name,last_name');
    await waitFor(() => expect(requetes('/api/leases').at(-1)!.get('filter[agent_id]')).toBe('5'));
    expect(requetes('/api/leases/summary').at(-1)!.get('filter[agent_id]')).toBe('5');
    // Au bureau, le déclencheur dit l'agent choisi ; « Tous les agents » le retire de l'URL.
    const declencheur = await screen.findByRole('button', { name: `${L.filtres.agent} : Pape Cissé` });
    await utilisateur.click(declencheur);
    await utilisateur.click(await screen.findByRole('button', { name: L.filtres.tousLesAgents }));
    await waitFor(() => expect(nav.query).not.toContain('agent='));
  });

  it('la file n’a pas de filtre de statut (ses motifs en tiennent lieu) ; les autres onglets l’ont', async () => {
    rendre();
    await carte('Mamadou Seck1');
    expect(screen.queryByRole('button', { name: new RegExp(`^${L.filtres.statut} :`) })).toBeNull();
    expect(screen.getByRole('button', { name: new RegExp(`^${L.filtres.motif} :`) })).toBeInTheDocument();
  });

  it('rien ne se perd — `?status=draft` lit les brouillons (hors des onglets), `?property=` filtre par bien', async () => {
    nav.poser('status=draft&property=25');
    baux = [bail(9, null, { status: 'draft' })];
    rendre();
    await within(bureau()).findByText('LS-9');
    const liste = requetes('/api/leases').at(-1)!;
    expect(liste.get('filter[status]')).toBe('draft');
    expect(liste.get('filter[property_id]')).toBe('25');
    expect(liste.get('filter[a_traiter]')).toBeNull();
    expect(requetes('/api/leases/summary').at(-1)!.get('filter[property_id]')).toBe('25');
    // Aucun onglet n'est choisi : le statut l'emporte.
    for (const tab of screen.getAllByRole('tab')) expect(tab).toHaveAttribute('aria-selected', 'false');
    expect(within(bureau()).getByText(fr.lease.status.draft)).toBeInTheDocument();
  });

  it('AC3 — « En attente du locataire » : `filter[onboarding_pending]=1`, le locataire nommé, ce qui manque, la signature, les jours en rouge au-delà de 14', async () => {
    nav.poser('vue=en_attente');
    baux = [bail(10, { motif: 'onboarding_incomplete', since: ilYA(16) }, { signed_at: '2026-10-20T10:00:00Z' })];
    listesDEntree = [{ id: 71, lease_id: 10, created_at: ilYA(16), welcome_seen_at: null, inventory_completed_at: null, first_payment_at: '2026-10-25', documents_acknowledged_at: '2026-10-25' }];
    rendre();
    const c = await carte('Mamadou Seck10');
    expect(requetes('/api/leases').at(-1)!.get('filter[onboarding_pending]')).toBe('1');
    await waitFor(() => expect(within(c).getByText('Il reste : Message d’accueil · État des lieux d’entrée · Signé le 20 oct. 2026')).toBeInTheDocument());
    expect(within(c).getByText('depuis 16 j')).toHaveClass('text-destructive');
    expect(within(c).getByRole('link', { name: 'Mamadou Seck10' })).toHaveAttribute('href', '/app/leases/10');
  });

  it('la file vide le dit, et mène aux baux actifs', async () => {
    baux = [];
    const utilisateur = rendre();
    expect(await within(telephone()).findByText(L.vide.a_traiter)).toBeInTheDocument();
    await utilisateur.click(within(telephone()).getByRole('button', { name: L.vide.voirActifs }));
    await waitFor(() => expect(requetes('/api/leases').at(-1)!.get('filter[status]')).toBe('active,terminating'));
  });
});

describe('TCK-2644 — le bailleur', () => {
  it('voit ses baux avec le nom du locataire, sans file, sans onglet, sans geste d’agence', async () => {
    baux = [SECK];
    rendre(<LeasesList vue="bailleur" peutCreer />);
    expect(await screen.findAllByText('Mamadou Seck1')).not.toHaveLength(0);
    expect(document.querySelector('[data-slot="baux-du-lecteur"]')).not.toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByText(L.onglets.a_traiter)).toBeNull();
    expect(document.querySelector('[data-slot="geste-du-bail"]')).toBeNull();
    expect(requetes('/api/leases/summary')).toHaveLength(0);
    expect(requetes('/api/leases').at(-1)!.get('filter[a_traiter]')).toBeNull();
  });
});
