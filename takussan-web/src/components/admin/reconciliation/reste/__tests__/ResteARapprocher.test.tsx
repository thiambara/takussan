/**
 * TCK-2675 — « Reste à rapprocher » : ce que l'écran demande à l'API et ce qu'il en dit.
 *
 * Le réseau est simulé au plus bas (`fetch`), pas les hooks : ce qu'on veut savoir est quelle
 * requête part (`filter[payment_method]=cash`, un seul `confirm-batch` à N identifiants) et que
 * chaque compte affiché est celui que l'API rend.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider, Toaster } from '@/components/ui/toast';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { withIntl } from '@/test/intl';
import type { BankStatement, FormatsPrisEnCharge, PaiementIgnore, PendingPayment, ReconciliationOverview } from '@/types/reconciliation';

import { ResteARapprocher, lignesSures } from '../ResteARapprocher';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams('period=2026-11'),
  usePathname: () => '/app/agency/finances/reconciliation',
}));
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: vi.fn(() => false) }));

const APERCU: ReconciliationOverview = {
  period: '2026-11',
  payments_total: 846,
  confirmed_automatically: { total: 812, by_provider: { wave: 540, orange_money: 272 } },
  to_reconcile: { total: 34, by_method: { cash: 21, bank_transfer: 13 } },
  reconciled_manually: 0,
  ignored: 0,
};

// TCK-2933 — les formats lus ; `banks` vide tant que D-67 tient (TCK-2932).
const FORMATS: FormatsPrisEnCharge = {
  formats: [
    { code: 'csv', extensions: ['csv', 'txt'], configurable_columns: true },
    { code: 'ofx', extensions: ['ofx', 'xml'], configurable_columns: false },
  ],
  banks: [],
};

const RELEVE: BankStatement = {
  id: 5,
  agency_id: 1,
  source_format: 'csv',
  bank_name: 'CBAO',
  account_iban_masked: null,
  period_start: '2026-11-01',
  period_end: '2026-11-30',
  lines_count: 40,
  skipped_lines_count: 0,
  status: 'partially_reconciled',
  finalized_at: null,
  reconciled_ratio: { confirmed: 10, ignored: 0, remaining: 30, total: 40 },
  created_at: '2026-11-11T09:12:00Z',
};

function paiement(id: number, confiance: number | null, surcharge: Partial<PendingPayment> = {}): PendingPayment {
  return {
    type: 'lease_payment',
    id,
    reference: `LP-${id}`,
    payer: { id: 100 + id, name: `Payeur ${id}` },
    property: { id: 200 + id, title: `Bien ${id}` },
    amount: String(100000 + id),
    currency: 'XOF',
    paid_at: '2026-11-08T10:00:00Z',
    payment_method: 'cash',
    suggested_line:
      confiance === null
        ? null
        : { id: 900 + id, statement_id: 5, date: '2026-11-09', label: `VERSEMENT ${id}`, amount: String(100000 + id), confidence: confiance },
    ...surcharge,
  };
}

const page = <T,>(data: T[], total = data.length) => ({ data, meta: { current_page: 1, last_page: 1, per_page: 20, total } });

interface Etat {
  apercu: ReconciliationOverview;
  releves: BankStatement[];
  liste: (url: URL) => { data: PendingPayment[]; meta: { total: number } };
  suggestions: PendingPayment[];
  /** La lecture des suggestions par page (`page`, filtres) ; sans elle, `suggestions` en une page. */
  lireSuggestions?: (url: URL) => { data: PendingPayment[]; meta: { current_page: number; last_page: number; per_page: number; total: number } };
  avecSuggestion: number;
  lot: () => Response | Promise<Response>;
  /** TCK-2933 — les réponses des gestes « Ignorer » / « Rétablir », des ignorés, des formats, de l'aperçu. */
  ignorer?: (corps: unknown) => Response;
  retablir?: (id: number) => Response;
  ignores?: PaiementIgnore[];
  formats?: FormatsPrisEnCharge;
  apercuReleve?: () => Response;
}

let etat: Etat;
const appels: { methode: string; url: URL; corps: unknown }[] = [];
const json = (corps: unknown, statut = 200) => new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } });

function repondre(entree: RequestInfo | URL, init?: RequestInit): Response | Promise<Response> {
  const url = new URL(String(entree));
  const methode = init?.method ?? 'GET';
  // Un envoi de fichier (`FormData`) est gardé tel quel : il ne se lit pas en JSON.
  const corps = init?.body instanceof FormData ? init.body : init?.body ? JSON.parse(String(init.body)) : undefined;
  appels.push({ methode, url, corps });
  const chemin = url.pathname;
  if (methode === 'POST' && chemin.endsWith('/bank-statement-lines/confirm-batch')) return etat.lot();
  // TCK-2933
  if (methode === 'POST' && chemin.endsWith('/reconciliation/ignored-payments')) return etat.ignorer ? etat.ignorer(corps) : json({ data: { id: 55 } }, 201);
  if (methode === 'DELETE' && /\/reconciliation\/ignored-payments\/\d+$/.test(chemin)) {
    const id = Number(chemin.split('/').pop());
    return etat.retablir ? etat.retablir(id) : new Response(null, { status: 204 });
  }
  if (methode === 'POST' && chemin.endsWith('/bank-statements/preview')) return etat.apercuReleve ? etat.apercuReleve() : json({ data: {} });
  if (methode === 'POST' && chemin.endsWith('/bank-statements')) return json({ data: { ...RELEVE, id: 6, status: 'processing' } }, 202);
  if (chemin.endsWith('/reconciliation/ignored-payments')) return json(page(etat.ignores ?? []));
  if (chemin.endsWith('/reconciliation/supported-formats')) return json({ data: etat.formats ?? FORMATS });
  if (methode !== 'GET') return json({ data: {} });
  if (chemin.endsWith('/reconciliation/overview')) return json({ data: etat.apercu });
  if (chemin.endsWith('/bank-statements')) return json(page(etat.releves));
  if (chemin.endsWith('/reconciliation/pending-payments')) {
    if (url.searchParams.get('filter[has_suggestion]') === '1' && url.searchParams.get('per_page') === '1') return json(page([], etat.avecSuggestion));
    if (url.searchParams.get('filter[has_suggestion]') === '1' && url.searchParams.get('per_page') === '100') return json(etat.lireSuggestions ? etat.lireSuggestions(url) : page(etat.suggestions));
    return json(etat.liste(url));
  }
  if (chemin.endsWith('/bank-statement-lines')) {
    return json(
      page([
        {
          id: 77,
          bank_statement_id: 5,
          posted_at: '2026-11-09',
          amount: '100003.00',
          direction: 'credit',
          currency: 'XOF',
          label: 'VIR PAYEUR 3',
          reference: null,
          counterparty: null,
          match_status: 'unmatched',
          matched_payment_type: null,
          matched_payment_id: null,
          match_confidence: null,
        },
      ]),
    );
  }
  return json({ data: [] });
}

function monter(fournisseurs: string[] | null = ['wave', 'orange_money']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    withIntl(
      <QueryClientProvider client={client}>
        {/* TCK-2933 — « Ignorer » répond par un toast « Annuler » : la coque `/app` monte le fournisseur. */}
        <ToastProvider>
          <ResteARapprocher agencyId={1} fournisseursConnectes={fournisseurs} />
          <Toaster />
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

const requetes = (fin: string, methode = 'GET') => appels.filter((a) => a.methode === methode && a.url.pathname.endsWith(fin));

beforeEach(() => {
  appels.length = 0;
  vi.mocked(useMatchesMedia).mockReturnValue(false);
  const tous = [paiement(1, 95), paiement(2, 95), paiement(3, 70), paiement(4, null)];
  etat = {
    apercu: APERCU,
    releves: [RELEVE],
    liste: () => page(tous, 34),
    suggestions: tous.filter((p) => p.suggested_line),
    avecSuggestion: 27,
    lot: () => json({ data: { line_ids: [901, 902], count: 2 } }),
  };
  vi.stubGlobal('fetch', vi.fn(async (entree: RequestInfo | URL, init?: RequestInit) => repondre(entree, init)));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ResteARapprocher — les compteurs', () => {
  it('lit les compteurs de l’API et en tire chaque phrase (téléphone)', async () => {
    monter();
    const compteurs = await screen.findByTestId('compteurs-du-reste');
    expect(within(compteurs).getByTestId('compte-auto')).toHaveTextContent('812');
    expect(within(compteurs).getByTestId('compte-reste')).toHaveTextContent('34');
    expect(compteurs).toHaveTextContent('par Wave et Orange Money');
    // La maquette : « espèces et virements » dans la phrase, au pluriel et sans capitale.
    expect(compteurs).toHaveTextContent('espèces et virements');
    expect(within(compteurs).getByTestId('phrase-du-mois')).toHaveTextContent('Novembre · 846 paiements · 96 % déjà rapprochés, sans relevé');
    expect(requetes('/reconciliation/overview')[0]?.url.searchParams.get('period')).toBe('2026-11');
  });

  it('sans passerelle ce mois-ci, ne nomme aucun fournisseur et ne dit pas « sans relevé »', async () => {
    etat.apercu = { ...APERCU, payments_total: 75, confirmed_automatically: { total: 0, by_provider: {} }, to_reconcile: { total: 70, by_method: { wave: 70 } }, reconciled_manually: 5 };
    monter();
    const compteurs = await screen.findByTestId('compteurs-du-reste');
    expect(compteurs).toHaveTextContent('Aucun ce mois-ci');
    expect(compteurs).not.toHaveTextContent(/Orange Money/);
    expect(within(compteurs).getByTestId('phrase-du-mois')).toHaveTextContent('Novembre · 75 paiements · 7 % déjà rapprochés');
    expect(compteurs).not.toHaveTextContent(/sans relevé/);
  });
});

describe('ResteARapprocher — « Confirmer les N »', () => {
  it('ne retient que les lignes à 90 % et plus, sans doublon', () => {
    const ligne95 = paiement(1, 95);
    expect(lignesSures([ligne95, { ...paiement(9, 95), suggested_line: ligne95.suggested_line }, paiement(2, 0.92), paiement(3, 89), paiement(4, null)])).toEqual([901, 902]);
  });

  it('AC1 — un seul confirm-batch aux seules lignes ≥ 90 %, puis les cartes confirmées disparaissent', async () => {
    const user = userEvent.setup();
    monter();
    const bandeau = await screen.findByTestId('bandeau-sures');
    expect(bandeau).toHaveTextContent('2 suggestions à plus de 90 %');

    // Après la confirmation, l'API ne rend plus les deux paiements confirmés.
    etat.liste = () => page([paiement(3, 70), paiement(4, null)], 32);
    etat.suggestions = [paiement(3, 70)];
    await user.click(within(bandeau).getByRole('button', { name: 'Confirmer les 2' }));

    await waitFor(() => expect(requetes('/confirm-batch', 'POST')).toHaveLength(1));
    expect(requetes('/confirm-batch', 'POST')[0]?.corps).toEqual({ line_ids: [901, 902] });
    expect(await screen.findByText('2 paiements rapprochés.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('reste-lease_payment-1')).toBeNull());
    expect(screen.queryByTestId('reste-lease_payment-2')).toBeNull();
    expect(screen.getByTestId('reste-lease_payment-3')).toBeInTheDocument();
  });

  // Contre-vérification de f05a8d1a5 (r3, r4) — quatre propriétés justes au navigateur, que rien ne
  // gardait (ablations vertes) : le lot vient de TOUTES les pages des suggestions (F4), il reprend le
  // filtre actif (F5), il est plafonné à 200 (F3), et les gestes d'une carte attendent sa fin (F9).
  it('F3 — 250 lignes sûres : le lot en porte 200, le plafond de `confirm-batch`', () => {
    const nombreux = Array.from({ length: 250 }, (_, i) => paiement(1000 + i, 95));
    const ids = lignesSures(nombreux);
    expect(ids).toHaveLength(200);
    expect(ids[0]).toBe(1900);
  });

  it('F4 — le lot vient de toutes les pages des suggestions, pas de la seule page affichée', async () => {
    etat.liste = () => page([paiement(1, 95)], 34);
    etat.lireSuggestions = (url) => {
      const n = Number(url.searchParams.get('page') ?? '1');
      const data = n === 1 ? [paiement(1, 95), paiement(2, 95)] : [paiement(3, 95)];
      return { data, meta: { current_page: n, last_page: 2, per_page: 100, total: 3 } };
    };
    etat.lot = () => json({ data: { line_ids: [901, 902, 903], count: 3 } });
    const user = userEvent.setup();
    monter();
    const bandeau = await screen.findByTestId('bandeau-sures');
    expect(bandeau).toHaveTextContent('3 suggestions à plus de 90 %');
    await user.click(within(bandeau).getByRole('button', { name: 'Confirmer les 3' }));
    await waitFor(() => expect(requetes('/confirm-batch', 'POST')).toHaveLength(1));
    expect(requetes('/confirm-batch', 'POST')[0]?.corps).toEqual({ line_ids: [901, 902, 903] });
  });

  it('F5 — sous « Espèces », les suggestions lues portent le filtre, et le lot ne confirme que les espèces', async () => {
    etat.liste = (url) => (url.searchParams.get('filter[payment_method]') === 'cash' ? page([paiement(12, 95)], 1) : page([paiement(1, 95)], 34));
    etat.lireSuggestions = (url) => {
      const data =
        url.searchParams.get('filter[payment_method]') === 'cash'
          ? [paiement(12, 95), paiement(13, 92)]
          : [paiement(1, 95, { payment_method: 'bank_transfer' }), paiement(12, 95), paiement(13, 92)];
      return { data, meta: { current_page: 1, last_page: 1, per_page: 100, total: data.length } };
    };
    etat.lot = () => json({ data: { line_ids: [912, 913], count: 2 } });
    const user = userEvent.setup();
    monter();
    const groupe = await screen.findByRole('group', { name: 'Filtrer les paiements à rapprocher' });
    await user.click(within(groupe).getByRole('button', { name: /Espèces/ }));
    const bandeau = await screen.findByTestId('bandeau-sures');
    await waitFor(() => expect(bandeau).toHaveTextContent('2 suggestions à plus de 90 %'));
    await user.click(within(bandeau).getByRole('button', { name: 'Confirmer les 2' }));
    await waitFor(() => expect(requetes('/confirm-batch', 'POST')).toHaveLength(1));
    expect(requetes('/confirm-batch', 'POST')[0]?.corps).toEqual({ line_ids: [912, 913] });
    const lues = requetes('/reconciliation/pending-payments').filter((a) => a.url.searchParams.get('filter[has_suggestion]') === '1' && a.url.searchParams.get('per_page') === '100');
    expect(lues.at(-1)?.url.searchParams.get('filter[payment_method]')).toBe('cash');
  });

  it('F9 — pendant le lot, les gestes d’une carte attendent : « Confirmer » et « Autre ligne » désactivés', async () => {
    let rendre: () => void = () => {};
    etat.lot = () => new Promise<Response>((r) => (rendre = () => r(json({ data: { line_ids: [901, 902], count: 2 } }))));
    const user = userEvent.setup();
    monter();
    const bandeau = await screen.findByTestId('bandeau-sures');
    const carte = await screen.findByTestId('reste-lease_payment-3');
    expect(within(carte).getByRole('button', { name: /Confirmer/ })).toBeEnabled();
    await user.click(within(bandeau).getByRole('button', { name: 'Confirmer les 2' }));
    await waitFor(() => expect(requetes('/confirm-batch', 'POST')).toHaveLength(1));
    expect(within(carte).getByRole('button', { name: /Confirmer/ })).toBeDisabled();
    expect(within(carte).getByRole('button', { name: 'Chercher une autre ligne pour Payeur 3' })).toBeDisabled();
    rendre();
    await waitFor(() => expect(within(screen.getByTestId('reste-lease_payment-3')).getByRole('button', { name: /Confirmer/ })).toBeEnabled());
  });

  it('un refus (422) le dit, ne retire rien de lui-même et relit la liste', async () => {
    etat.lot = () => json({ code: 'reconciliation.batch_not_confirmable', message: 'Une des lignes n’est plus proposée.' }, 422);
    const user = userEvent.setup();
    monter();
    const bandeau = await screen.findByTestId('bandeau-sures');
    const lecturesAvant = requetes('/reconciliation/pending-payments').length;
    await user.click(within(bandeau).getByRole('button', { name: 'Confirmer les 2' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Une des lignes n’est plus proposée.');
    expect(screen.getByTestId('reste-lease_payment-1')).toBeInTheDocument();
    await waitFor(() => expect(requetes('/reconciliation/pending-payments').length).toBeGreaterThan(lecturesAvant));
  });
});

describe('ResteARapprocher — les pastilles', () => {
  it('AC2 — « Espèces » filtre côté serveur (`filter[payment_method]=cash`) ; autant de cartes que `meta.total`', async () => {
    const especes = [paiement(11, null), paiement(12, 95), paiement(13, null)];
    etat.liste = (url) => (url.searchParams.get('filter[payment_method]') === 'cash' ? page(especes, 3) : page([paiement(1, 95)], 34));
    const user = userEvent.setup();
    monter();
    const groupe = await screen.findByRole('group', { name: 'Filtrer les paiements à rapprocher' });
    await user.click(within(groupe).getByRole('button', { name: /Espèces/ }));

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3));
    const lue = requetes('/reconciliation/pending-payments').find((a) => a.url.searchParams.get('filter[payment_method]') === 'cash' && a.url.searchParams.get('per_page') === '20');
    expect(lue).toBeDefined();
    expect(within(groupe).getByRole('button', { name: /Espèces/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('« Afficher les N autres » lit toutes les pages, jusqu’à `meta.total`', async () => {
    const vingt = Array.from({ length: 20 }, (_, i) => paiement(i + 1, null));
    const vingtCinq = Array.from({ length: 25 }, (_, i) => paiement(i + 1, null));
    etat.liste = (url) => (url.searchParams.get('per_page') === '100' ? { ...page(vingtCinq, 25) } : page(vingt, 25));
    const user = userEvent.setup();
    monter();
    await user.click(await screen.findByRole('button', { name: 'Afficher les 5 autres' }));
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(25));
    expect(screen.queryByRole('button', { name: /Afficher les/ })).toBeNull();
  });
});

describe('ResteARapprocher — au bureau', () => {
  beforeEach(() => vi.mocked(useMatchesMedia).mockReturnValue(true));

  it('le tableau en français ; « Délier » défait la ligne proposée (DELETE)', async () => {
    const user = userEvent.setup();
    monter();
    expect(await screen.findByRole('columnheader', { name: 'Paiement déclaré' })).toBeInTheDocument();
    expect(screen.getByText('4 lignes affichées sur 34 · les montants les plus élevés d’abord')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Délier la ligne proposée pour Payeur 3' }));
    await waitFor(() => expect(requetes('/bank-statement-lines/903/match', 'DELETE')).toHaveLength(1));
  });

  // La maquette nomme le moyen selon la place : « Espèces 21 · Virements 13 » au compte et sur la
  // pastille, « Virement » sur la rangée ; un relevé d'un mois entier se nomme par son mois.
  it('le moyen au pluriel au compte et sur la pastille, court sur la rangée ; le relevé par son mois', async () => {
    etat.liste = () => page([paiement(1, 95, { payment_method: 'bank_transfer' })], 1);
    monter();
    const compteurs = await screen.findByTestId('compteurs-du-reste');
    expect(compteurs).toHaveTextContent('Espèces 21 · Virements 13');
    expect(await screen.findByRole('button', { name: /^Virements/ })).toBeInTheDocument();
    const rangee = await screen.findByTestId('reste-lease_payment-1');
    expect(rangee).toHaveTextContent(/Virement/);
    expect(rangee).not.toHaveTextContent(/Virement bancaire/);
    expect(await screen.findByTestId('releve-5')).toHaveTextContent('Novembre 2026');
    expect(screen.getByTestId('releve-5')).not.toHaveTextContent('→');
  });

  it('« Chercher » cherche un crédit au montant du paiement, puis rapproche la ligne choisie', async () => {
    const user = userEvent.setup();
    monter();
    await user.click(await screen.findByRole('button', { name: 'Chercher une autre ligne pour Payeur 4' }));
    const dialogue = await screen.findByRole('dialog');
    await waitFor(() => expect(requetes('/bank-statement-lines')).toHaveLength(1));
    const recherche = requetes('/bank-statement-lines')[0]!.url.searchParams;
    expect(recherche.get('filter[direction]')).toBe('credit');
    expect(recherche.get('filter[amount]')).toBe('100004');

    await user.click(await within(dialogue).findByRole('button', { name: 'Rapprocher' }));
    await waitFor(() => expect(requetes('/bank-statement-lines/77/match', 'POST')).toHaveLength(1));
    expect(requetes('/bank-statement-lines/77/match', 'POST')[0]?.corps).toEqual({ payment_type: 'lease_payment', payment_id: 4 });
  });

  // Contre-vérification de f05a8d1a5 (r1) — la banque porte le loyer ET la pénalité réglée le même
  // jour : « Chercher » cherche `expected_bank_amount`, la règle du matcher, pas `amount`.
  it('r1 — « Chercher » cherche le montant attendu en banque (pénalité du même jour comprise)', async () => {
    etat.liste = () => page([paiement(4, null, { amount: '500000.00', expected_bank_amount: 525000 })], 1);
    const user = userEvent.setup();
    monter();
    await user.click(await screen.findByRole('button', { name: 'Chercher une autre ligne pour Payeur 4' }));
    const dialogue = await screen.findByRole('dialog');
    await waitFor(() => expect(requetes('/bank-statement-lines')).toHaveLength(1));
    expect(requetes('/bank-statement-lines')[0]!.url.searchParams.get('filter[amount]')).toBe('525000');
    expect(within(dialogue).getByLabelText('Montant')).toHaveValue('525000');
  });

  it('« Paiements en ligne » : les fournisseurs connectés et ce qu’ils ont confirmé ce mois-ci', async () => {
    monter();
    const carte = (await screen.findByRole('heading', { name: 'Paiements en ligne' })).closest('section')!;
    expect(carte).toHaveTextContent('Wave540 confirmés en novembreConnecté');
    expect(carte).toHaveTextContent('Orange Money272 confirmés en novembreConnecté');
  });

  it('intégrations illisibles : la carte se tait, elle n’affirme pas « aucun connecté »', async () => {
    monter(null);
    expect(await screen.findByRole('columnheader', { name: 'Paiement déclaré' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Paiements en ligne' })).toBeNull();
    expect(screen.queryByText(/Aucun paiement en ligne/)).toBeNull();
  });
});

describe('ResteARapprocher — les relevés et les intégrations', () => {
  it('deux relevés, puis « Voir les 3 relevés » (au pluriel accordé) les montre tous', async () => {
    etat.releves = [RELEVE, { ...RELEVE, id: 6 }, { ...RELEVE, id: 7 }];
    monter();
    expect(await screen.findByTestId('releve-6')).toBeInTheDocument();
    expect(screen.queryByTestId('releve-7')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Voir les 3 relevés' }));
    expect(screen.getByTestId('releve-7')).toBeInTheDocument();
  });

  it('au bureau, aucune intégration connectée : la carte le dit par l’état vide', async () => {
    vi.mocked(useMatchesMedia).mockReturnValue(true);
    monter([]);
    const carte = (await screen.findByRole('heading', { name: 'Paiements en ligne' })).closest('section')!;
    expect(within(carte).getByRole('heading', { name: 'Aucun paiement en ligne n’est connecté.' })).toBeInTheDocument();
  });
});

describe('ResteARapprocher — aucun relevé', () => {
  beforeEach(() => {
    etat.releves = [];
  });

  // TCK-2933 — l'aperçu avant import existe : la promesse de la maquette est tenue. Les banques, elles,
  // ne se nomment que lues de l'API (D-67) : liste vide, aucun nom de banque n'est inventé.
  it('dit ce qui manque, d’après les données, et ne promet que ce que le produit fait', async () => {
    monter();
    const vide = await screen.findByTestId('sans-releve');
    expect(within(vide).getByRole('heading', { name: 'Il ne manque que le relevé de la banque' })).toBeInTheDocument();
    expect(vide).toHaveTextContent('Tout ce qui est passé par Wave et Orange Money est déjà rapproché. Pour les 34 paiements qui restent, importez le relevé de votre banque.');
    expect(vide).toHaveTextContent('CSV ou OFX · on vous montre ce qu’on a lu avant d’importer');
    const banques = await screen.findByTestId('banques-prises-en-charge');
    expect(document.body).not.toHaveTextContent(/CBAO|Ecobank|SGBS|Wave Business/);
    expect(banques).toHaveTextContent('CSV — colonnes réglables');
    expect(screen.getByTestId('compteurs-du-reste')).toHaveTextContent('En attente d’un relevé');
    expect(screen.queryByTestId('reste-lease_payment-1')).toBeNull();
  });

  it('rien à rapprocher et aucun relevé : l’import reste offert (téléphone et bureau)', async () => {
    etat.apercu = { ...APERCU, to_reconcile: { total: 0, by_method: {} } };
    monter();
    expect(await screen.findByTestId('tout-rapproche')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Importer un relevé bancaire/ })).toBeInTheDocument();
  });

  it('au bureau, l’en-tête n’offre l’import que hors de l’écran « Il ne manque que le relevé »', async () => {
    vi.mocked(useMatchesMedia).mockReturnValue(true);
    monter();
    const vide = await screen.findByTestId('sans-releve');
    expect(screen.getAllByRole('button', { name: 'Importer un relevé' })).toEqual([within(vide).getByRole('button', { name: 'Importer un relevé' })]);
  });

  it('« Importer un relevé » ouvre l’import, au sélecteur de fichier traduit', async () => {
    const user = userEvent.setup();
    monter();
    await user.click(within(await screen.findByTestId('sans-releve')).getByRole('button', { name: 'Importer un relevé' }));
    const fenetre = await screen.findByRole('dialog');
    expect(within(fenetre).getByRole('button', { name: 'Choisir un fichier' })).toBeInTheDocument();
    expect(within(fenetre).getByText('Aucun fichier choisi')).toBeInTheDocument();
  });
});

/* ─────────────── TCK-2933 — « Ignorer », « Banques prises en charge », l'aperçu avant import ─────────────── */

describe('TCK-2933 — « Ignorer » un paiement sans ligne de banque', () => {
  beforeEach(() => {
    vi.mocked(useMatchesMedia).mockReturnValue(true);
  });

  // L'API sert l'état du serveur : après le POST, le paiement 4 sort du reste et « À rapprocher »
  // passe à 33 ; après le DELETE, il revient.
  function avecServeur() {
    const tous = [paiement(1, 95), paiement(2, 95), paiement(3, 70), paiement(4, null)];
    let ignore = false;
    etat.liste = () => (ignore ? page(tous.slice(0, 3), 33) : page(tous, 34));
    etat.ignorer = () => {
      ignore = true;
      etat.apercu = { ...APERCU, to_reconcile: { total: 33, by_method: { cash: 20, bank_transfer: 13 } }, ignored: 1 };
      return json({ data: { id: 55, reason: 'cash_kept', note: null, ignored_at: '2026-11-12T10:00:00Z', ignored_by: null, payment: null } }, 201);
    };
    etat.retablir = () => {
      ignore = false;
      etat.apercu = APERCU;
      return new Response(null, { status: 204 });
    };
  }

  it('AC1 — « Espèces gardées à l’agence » envoie `cash_kept`, retire la rangée, décrémente ; « Annuler » du toast la remet', async () => {
    avecServeur();
    const user = userEvent.setup();
    monter();
    const rangee = await screen.findByTestId('reste-lease_payment-4');
    // « Ignorer » n'est offert qu'au paiement sans ligne proposée.
    expect(within(screen.getByTestId('reste-lease_payment-3')).queryByRole('button', { name: /Ignorer/ })).toBeNull();
    await user.click(within(rangee).getByRole('button', { name: 'Ignorer le paiement de Payeur 4' }));

    const fenetre = await screen.findByRole('dialog');
    expect(within(fenetre).getByRole('button', { name: 'Ignorer le paiement' })).toBeDisabled();
    await user.click(within(fenetre).getByRole('button', { name: 'Espèces gardées à l’agence' }));
    await user.click(within(fenetre).getByRole('button', { name: 'Ignorer le paiement' }));

    await waitFor(() => expect(requetes('/reconciliation/ignored-payments', 'POST')).toHaveLength(1));
    expect(requetes('/reconciliation/ignored-payments', 'POST')[0]?.corps).toEqual({ payable_type: 'lease_payment', payable_id: 4, reason: 'cash_kept' });
    await waitFor(() => expect(screen.queryByTestId('reste-lease_payment-4')).toBeNull());
    expect(screen.getByTestId('compte-reste')).toHaveTextContent('33');
    expect(await screen.findByText('Paiement ignoré.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(requetes('/reconciliation/ignored-payments/55', 'DELETE')).toHaveLength(1));
    expect(await screen.findByTestId('reste-lease_payment-4')).toBeInTheDocument();
    expect(screen.getByTestId('compte-reste')).toHaveTextContent('34');
  });

  it('« Autre » exige un texte, envoyé en `note`', async () => {
    const user = userEvent.setup();
    monter();
    await user.click(within(await screen.findByTestId('reste-lease_payment-4')).getByRole('button', { name: 'Ignorer le paiement de Payeur 4' }));
    const fenetre = await screen.findByRole('dialog');
    await user.click(within(fenetre).getByRole('button', { name: 'Autre' }));
    await user.click(within(fenetre).getByRole('button', { name: 'Ignorer le paiement' }));
    expect(within(fenetre).getByRole('alert')).toHaveTextContent('Précisez le motif pour « Autre ».');
    expect(requetes('/reconciliation/ignored-payments', 'POST')).toHaveLength(0);

    await user.type(within(fenetre).getByLabelText('Précisez le motif'), 'Remis au bailleur en main propre');
    await user.click(within(fenetre).getByRole('button', { name: 'Ignorer le paiement' }));
    await waitFor(() => expect(requetes('/reconciliation/ignored-payments', 'POST')).toHaveLength(1));
    expect(requetes('/reconciliation/ignored-payments', 'POST')[0]?.corps).toEqual({
      payable_type: 'lease_payment',
      payable_id: 4,
      reason: 'other',
      note: 'Remis au bailleur en main propre',
    });
  });

  it('un refus (422) se dit dans la fenêtre, qui reste ouverte', async () => {
    etat.ignorer = () => json({ code: 'reconciliation.payment_not_pending', message: 'Seul un paiement encaissé, hors passerelle et non rapproché peut être sorti du reste à rapprocher.' }, 422);
    const user = userEvent.setup();
    monter();
    await user.click(within(await screen.findByTestId('reste-lease_payment-4')).getByRole('button', { name: 'Ignorer le paiement de Payeur 4' }));
    const fenetre = await screen.findByRole('dialog');
    await user.click(within(fenetre).getByRole('button', { name: 'Versé sur un autre compte' }));
    await user.click(within(fenetre).getByRole('button', { name: 'Ignorer le paiement' }));
    expect(await within(fenetre).findByRole('alert')).toHaveTextContent('Seul un paiement encaissé');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('au téléphone, « Ignorer » est dans le menu de la carte sans ligne', async () => {
    vi.mocked(useMatchesMedia).mockReturnValue(false);
    const user = userEvent.setup();
    monter();
    const carte = await screen.findByTestId('reste-lease_payment-4');
    expect(within(screen.getByTestId('reste-lease_payment-3')).queryByRole('button', { name: /Autres gestes/ })).toBeNull();
    await user.click(within(carte).getByRole('button', { name: 'Autres gestes pour Payeur 4' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Ignorer' }));
    expect(await screen.findByRole('button', { name: 'Espèces gardées à l’agence' })).toBeInTheDocument();
  });

  it('les ignorés du mois se rouvrent et se rétablissent par l’`id` du geste (après le toast)', async () => {
    etat.apercu = { ...APERCU, ignored: 1 };
    etat.ignores = [{ id: 71, reason: 'cash_kept', note: null, ignored_at: '2026-11-12T10:00:00Z', ignored_by: null, payment: paiement(9, null) }];
    const user = userEvent.setup();
    monter();
    const bloc = await screen.findByTestId('paiements-ignores');
    expect(bloc).toHaveTextContent('1 paiement ignoré ce mois-ci');
    expect(requetes('/reconciliation/ignored-payments')).toHaveLength(0);
    await user.click(within(bloc).getByRole('button', { name: 'Voir' }));
    const ligne = await within(bloc).findByTestId('ignore-71');
    expect(ligne).toHaveTextContent('Payeur 9');
    expect(ligne).toHaveTextContent('Espèces gardées à l’agence');
    expect(requetes('/reconciliation/ignored-payments')[0]?.url.searchParams.get('period')).toBe('2026-11');
    await user.click(within(ligne).getByRole('button', { name: 'Rétablir le paiement de Payeur 9' }));
    await waitFor(() => expect(requetes('/reconciliation/ignored-payments/71', 'DELETE')).toHaveLength(1));
  });

  it('aucun ignoré : rien n’est rendu', async () => {
    monter();
    await screen.findByTestId('reste-lease_payment-4');
    expect(screen.queryByTestId('paiements-ignores')).toBeNull();
  });
});

describe('TCK-2933 — « Banques prises en charge »', () => {
  beforeEach(() => {
    etat.releves = [];
  });

  it('AC2 — une puce par banque de `supported-formats.banks`, et rien d’autre', async () => {
    etat.formats = { ...FORMATS, banks: [{ code: 'cbao', name: 'CBAO', format: 'csv' }, { code: 'wave_business', name: 'Wave Business', format: 'csv' }] };
    monter();
    const banques = await screen.findByTestId('banques-prises-en-charge');
    expect(within(banques).getByRole('heading', { name: 'Banques prises en charge' })).toBeInTheDocument();
    expect(within(banques).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['CBAO', 'Wave Business']);
    expect(banques).not.toHaveTextContent('colonnes réglables');
  });

  it('AC2 — liste vide : la ligne des formats lus, au bureau aussi', async () => {
    vi.mocked(useMatchesMedia).mockReturnValue(true);
    monter();
    const banques = await screen.findByTestId('banques-prises-en-charge');
    expect(within(banques).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['CSV — colonnes réglables', 'OFX']);
    expect(banques).toHaveTextContent('L’import lit vos relevés par leur format, quelle que soit la banque :');
  });

  it('formats illisibles : la rubrique se tait', async () => {
    let lus = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (entree: RequestInfo | URL, init?: RequestInit) => {
        if (!new URL(String(entree)).pathname.endsWith('/supported-formats')) return repondre(entree, init);
        lus++;
        return json({ message: 'Panne' }, 500);
      }),
    );
    monter();
    await screen.findByTestId('sans-releve');
    await waitFor(() => expect(lus).toBe(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId('banques-prises-en-charge')).toBeNull();
    expect(document.body).not.toHaveTextContent('colonnes réglables');
  });
});

describe('TCK-2933 — l’aperçu avant import', () => {
  const APERCU_LU = {
    source_format: 'csv',
    read: 38,
    skipped: 7,
    skipped_by_reason: { invalid_date: 6, missing_value: 1 },
    skipped_lines: [2, 5, 9, 11, 14, 17].map((line) => ({ line, reason: 'invalid_date' })).concat([{ line: 20, reason: 'missing_value' }]),
    period: { start: '2026-11-01', end: '2026-11-30' },
    lines: Array.from({ length: 10 }, (_, i) => ({
      date: `2026-11-${String(i + 1).padStart(2, '0')}`,
      amount: `${(i + 1) * 1000}.00`,
      direction: i % 2 === 0 ? 'credit' : 'debit',
      currency: 'XOF',
      label: `VIR LIGNE ${i + 1}`,
      reference: null,
      counterparty: null,
    })),
    already_imported: false,
  };

  async function ouvrirEtChoisir(user: ReturnType<typeof userEvent.setup>, nom = 'releve.csv') {
    await user.click(within(await screen.findByTestId('sans-releve')).getByRole('button', { name: 'Importer un relevé' }));
    const fenetre = await screen.findByRole('dialog');
    const champ = fenetre.querySelector<HTMLInputElement>('#releve-fichier');
    if (!champ) throw new Error('champ de fichier absent');
    await user.upload(champ, new File(['date;montant\n'], nom, { type: 'text/csv' }));
    return fenetre;
  }

  beforeEach(() => {
    etat.releves = [];
    etat.apercuReleve = () => json({ data: APERCU_LU });
  });

  it('AC3 — le fichier choisi est LU d’abord : comptes, raisons, période, 10 lignes ; aucun relevé créé', async () => {
    const user = userEvent.setup();
    monter();
    const fenetre = await ouvrirEtChoisir(user);
    const apercu = await within(fenetre).findByTestId('apercu-du-releve');

    expect(requetes('/bank-statements/preview', 'POST')).toHaveLength(1);
    const envoye = requetes('/bank-statements/preview', 'POST')[0]?.corps as FormData;
    expect(envoye.get('source_format')).toBe('csv');
    expect((envoye.get('file') as File).name).toBe('releve.csv');
    expect(requetes('/bank-statements', 'POST')).toHaveLength(0);

    expect(within(apercu).getByTestId('apercu-comptes')).toHaveTextContent('38 lignes lues · 7 lignes non lues · Du 1 nov. au 30 nov.');
    expect(within(apercu).getByTestId('apercu-non-lues')).toHaveTextContent('Ligne 2 : date illisible');
    expect(within(apercu).getByTestId('apercu-non-lues')).toHaveTextContent('et 2 autres lignes');
    expect(within(within(apercu).getByTestId('apercu-lignes')).getAllByRole('listitem')).toHaveLength(10);
    expect(apercu).toHaveTextContent('Les 10 premières lignes');
  });

  it('AC3 — « Changer de fichier » ne crée aucun relevé ; « Importer » crée le relevé', async () => {
    const user = userEvent.setup();
    monter();
    const fenetre = await ouvrirEtChoisir(user);
    await within(fenetre).findByTestId('apercu-du-releve');

    await user.click(within(fenetre).getByRole('button', { name: 'Changer de fichier' }));
    expect(within(fenetre).queryByTestId('apercu-du-releve')).toBeNull();
    expect(within(fenetre).getByRole('button', { name: 'Importer' })).toBeDisabled();
    expect(requetes('/bank-statements', 'POST')).toHaveLength(0);

    const champ = fenetre.querySelector<HTMLInputElement>('#releve-fichier');
    if (!champ) throw new Error('champ de fichier absent');
    await user.upload(champ, new File(['x'], 'novembre.csv', { type: 'text/csv' }));
    await within(fenetre).findByTestId('apercu-du-releve');
    await user.click(within(fenetre).getByRole('button', { name: 'Importer' }));
    await waitFor(() => expect(requetes('/bank-statements', 'POST')).toHaveLength(1));
    expect(((requetes('/bank-statements', 'POST')[0]?.corps as FormData).get('file') as File).name).toBe('novembre.csv');
    expect(await within(fenetre).findByText('Relevé reçu : l’analyse est en cours.')).toBeInTheDocument();
  });

  it('un fichier déjà importé : l’aperçu le dit, « Importer » est refusé d’avance', async () => {
    etat.apercuReleve = () => json({ data: { ...APERCU_LU, already_imported: true } });
    const user = userEvent.setup();
    monter();
    const fenetre = await ouvrirEtChoisir(user);
    expect(await within(fenetre).findByText('Ce fichier a déjà été importé : l’importer de nouveau serait refusé.')).toBeInTheDocument();
    expect(within(fenetre).getByRole('button', { name: 'Importer' })).toBeDisabled();
  });

  it('un fichier illisible (422) : la raison de l’API, rien d’importable', async () => {
    etat.apercuReleve = () =>
      json({ code: 'reconciliation.preview_unreadable', message: 'Le relevé n’a pas pu être lu : son en-tête ou son contenu ne correspond pas au format choisi.' }, 422);
    const user = userEvent.setup();
    monter();
    const fenetre = await ouvrirEtChoisir(user);
    expect(await within(fenetre).findByRole('alert')).toHaveTextContent('son en-tête ou son contenu ne correspond pas');
    expect(within(fenetre).getByRole('button', { name: 'Importer' })).toBeDisabled();
  });
});
