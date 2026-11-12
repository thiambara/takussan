/**
 * TCK-2660 — les impayés d'« Argent » : une carte (téléphone) ou une ligne (bureau) par échéance,
 * filtrées par la règle *Impayé* (`days_late_min`), et la relance qui ouvre WhatsApp sur le
 * téléphone de l'agence avec le lien de paiement de l'échéance, puis la NOTE (ADR-0105).
 *
 * Le réseau est un faux serveur derrière `apiRequest` : chaque requête est relevée, comme on la
 * lirait dans l'onglet Réseau (AC1, AC3). Le message passe par la vraie action serveur.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
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

const historiques = () =>
  reseau.appels.filter((a) => a.chemin.startsWith('/api/payments/history')).map((a) => new URL(a.chemin, 'http://api.test').searchParams);
const cartes = () => screen.queryAllByRole('article');

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

describe('TCK-2660 — la liste des impayés', () => {
  it('lit la règle *Impayé* partagée (`days_late_min=1`, JAMAIS `filter[status]`) : une échéance `pending` échue y est (TCK-595)', async () => {
    lignes = [ligne(1, 40), ligne(2, 3, { status: 'pending' })];
    rendre();

    expect(await screen.findByRole('article', { name: 'Locataire 2' })).toBeInTheDocument();
    const liste = historiques().find((p) => p.get('per_page') === '20')!;
    expect(liste.get('filter[days_late_min]')).toBe('1');
    expect(liste.get('filter[status]')).toBeNull();
    expect(liste.get('sort')).toBe('-days_late');
    expect(liste.get('include')).toBe('payer,property,landlord,reminders');
  });

  it('AC3 — « Plus de 30 j » envoie `filter[days_late_min]=31` et montre autant de cartes que `meta.total`', async () => {
    lignes = [ligne(1, 68), ligne(2, 41), ligne(3, 34), ligne(4, 12), ligne(5, 2)];
    const utilisateur = rendre();
    await screen.findByRole('article', { name: 'Locataire 5' });

    await utilisateur.click(screen.getByRole('button', { name: /Plus de 30 j/ }));

    await waitFor(() => expect(cartes()).toHaveLength(3));
    const liste = historiques().filter((p) => p.get('per_page') === '20').at(-1)!;
    expect(liste.get('filter[days_late_min]')).toBe('31');
    expect(liste.get('filter[days_late_max]')).toBeNull();
    // Le compte de la pastille est `meta.total` de sa requête (`per_page=1`).
    expect(screen.getByRole('button', { name: /Plus de 30 j/ })).toHaveTextContent('3');
  });

  it('les trois comptes partent en parallèle (`per_page=1`) ; un compte en échec laisse sa pastille sans chiffre, rien d’autre ne casse', async () => {
    lignes = [ligne(1, 40), ligne(2, 10), ligne(3, 2)];
    reseau.refus.add('history:8-30');
    rendre();

    await screen.findByRole('article', { name: 'Locataire 3' });
    const comptes = historiques().filter((p) => p.get('per_page') === '1');
    expect(comptes.map((p) => `${p.get('filter[days_late_min]')}-${p.get('filter[days_late_max]') ?? ''}`).sort()).toEqual(['1-7', '31-', '8-30']);
    await waitFor(() => expect(screen.getByRole('button', { name: /Plus de 30 j/ })).toHaveTextContent('1'));
    expect(screen.getByRole('button', { name: /8–30 j/ })).toHaveTextContent(/^8–30 j$/);
    expect(cartes()).toHaveLength(3);
  });

  it('« Voir plus » ajoute la page suivante de 20', async () => {
    lignes = Array.from({ length: 25 }, (_, i) => ligne(i + 1, 60 - i));
    const utilisateur = rendre();
    await waitFor(() => expect(cartes()).toHaveLength(20));

    await utilisateur.click(screen.getByRole('button', { name: 'Voir les 5 autres' }));

    await waitFor(() => expect(cartes()).toHaveLength(25));
    expect(screen.queryByRole('button', { name: /Voir les/ })).not.toBeInTheDocument();
  });

  it('AC6 — sans numéro, « Relancer sur WhatsApp » est désactivé, et `aria-describedby` nomme la phrase qui dit pourquoi', async () => {
    lignes = [ligne(1, 20, { payer: { id: 301, name: 'Sans Numéro', phone: null, first_name: 'Sans', locale: null } })];
    rendre();

    const carte = await screen.findByRole('article', { name: 'Sans Numéro' });
    const bouton = within(carte).getByRole('button', { name: /Relancer sur WhatsApp/ });
    expect(bouton).toBeDisabled();
    const raison = document.getElementById(bouton.getAttribute('aria-describedby') ?? '');
    expect(raison).toHaveTextContent('Aucun numéro pour ce locataire');
    expect(within(carte).getByRole('link', { name: 'Fiche client' })).toHaveAttribute('href', '/app/customers/301');
  });
});

describe('TCK-2660 — la relance (téléphone)', () => {
  it('AC1 — « Ouvrir WhatsApp » ouvre wa.me au numéro, avec le lien rendu par POST …/payment-link, puis NOTE la relance (`whatsapp`) : la carte dit « relancé aujourd’hui » sans rechargement', async () => {
    lignes = [ligne(1, 34)];
    const utilisateur = rendre();
    const carte = await screen.findByRole('article', { name: 'Locataire 1' });
    expect(within(carte).getByText(/jamais relancé/)).toBeInTheDocument();

    await utilisateur.click(within(carte).getByRole('button', { name: /Relancer sur WhatsApp/ }));
    const ouvrir = await screen.findByRole('link', { name: /Ouvrir WhatsApp/ });

    const href = new URL(ouvrir.getAttribute('href')!);
    expect(`${href.origin}${href.pathname}`).toBe('https://wa.me/221771234567');
    const texte = href.searchParams.get('text')!;
    expect(texte).toContain(LIEN);
    expect(texte).toMatch(/^Bonjour Prénom1, le loyer d’octobre/);
    expect(reseau.appels.some((a) => a.methode === 'POST' && a.chemin === '/api/lease-payments/1/payment-link')).toBe(true);
    expect(document.body.textContent).not.toContain('Lu le');

    await utilisateur.click(ouvrir);

    await waitFor(() =>
      expect(reseau.appels.find((a) => a.methode === 'POST' && a.chemin === '/api/lease-payments/1/reminders')?.corps).toEqual({ channel: 'whatsapp' }),
    );
    await waitFor(() => expect(within(screen.getByRole('article', { name: 'Locataire 1' })).getByText(/relancé aujourd’hui/)).toBeInTheDocument());
    // La liste n'a pas été relue : la carte a pris la relance de la réponse.
    expect(historiques().filter((p) => p.get('per_page') === '20')).toHaveLength(1);
  });

  it('un 409 du lien dit que l’échéance ne se paie plus en ligne, et « Ouvrir WhatsApp » reste un bouton désactivé, sans wa.me', async () => {
    lignes = [ligne(1, 34)];
    reseau.refus.add('lien:1');
    const utilisateur = rendre();
    const carte = await screen.findByRole('article', { name: 'Locataire 1' });

    await utilisateur.click(within(carte).getByRole('button', { name: /Relancer sur WhatsApp/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Cette échéance ne se paie plus en ligne');
    const bouton = screen.getByRole('button', { name: /Ouvrir WhatsApp/ });
    expect(bouton).toBeDisabled();
    expect(document.getElementById(bouton.getAttribute('aria-describedby') ?? '')).toHaveTextContent('ne se paie plus en ligne');
    expect(document.querySelector('a[href^="https://wa.me"]')).toBeNull();
    expect(reseau.appels.some((a) => a.chemin.endsWith('/reminders') && a.methode === 'POST')).toBe(false);
  });

  it('« Appeler » est un lien `tel:` qui note la relance (`call`)', async () => {
    lignes = [ligne(1, 34)];
    const utilisateur = rendre();
    const carte = await screen.findByRole('article', { name: 'Locataire 1' });

    const appeler = within(carte).getByRole('link', { name: /Appeler/ });
    expect(appeler).toHaveAttribute('href', 'tel:+221771234567');
    await utilisateur.click(appeler);

    await waitFor(() => expect(reseau.appels.find((a) => a.methode === 'POST' && a.chemin.endsWith('/reminders'))?.corps).toEqual({ channel: 'call' }));
    expect(toastAdd).not.toHaveBeenCalled();
  });

  it('une note refusée le DIT (P228.06) : l’appel est parti, la carte ne prétend pas « relancé aujourd’hui »', async () => {
    lignes = [ligne(1, 34)];
    reseau.refus.add('note:1');
    const utilisateur = rendre();
    const carte = await screen.findByRole('article', { name: 'Locataire 1' });

    await utilisateur.click(within(carte).getByRole('link', { name: /Appeler/ }));

    await waitFor(() => expect(toastAdd).toHaveBeenCalledWith({ title: 'Le serveur a rencontré une erreur. Réessayez dans un instant.', type: 'error' }));
    expect(within(screen.getByRole('article', { name: 'Locataire 1' })).getByText(/jamais relancé/)).toBeInTheDocument();
  });

  it('une note refusée après « Ouvrir WhatsApp » le DIT aussi, alors que la feuille qui l’a lancée se referme', async () => {
    lignes = [ligne(1, 34)];
    reseau.refus.add('note:1');
    const utilisateur = rendre();
    const carte = await screen.findByRole('article', { name: 'Locataire 1' });
    await utilisateur.click(within(carte).getByRole('button', { name: /Relancer sur WhatsApp/ }));

    await utilisateur.click(await screen.findByRole('link', { name: /Ouvrir WhatsApp/ }));

    await waitFor(() => expect(toastAdd).toHaveBeenCalledWith({ title: 'Le serveur a rencontré une erreur. Réessayez dans un instant.', type: 'error' }));
  });
});

describe('TCK-2660 — le bureau', () => {
  it('la table, puis le dossier : relances notées et automatiques, aucun « Lu le » (AC5)', async () => {
    bureau(true);
    lignes = [ligne(1, 34)];
    const utilisateur = rendre();

    await utilisateur.click(await screen.findByRole('button', { name: 'Ouvrir le dossier de Locataire 1' }));

    const panneau = await screen.findByRole('dialog');
    expect(await within(panneau).findByText(/Sokhna Sène/)).toBeInTheDocument();
    expect(within(panneau).getByText(/1 j après l’échéance/)).toBeInTheDocument();
    expect(await within(panneau).findByText('Caution détenue')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('Lu le');
    // Décision 3 — l'ancienneté du dû de CE locataire, que montrait l'âge des créances par locataire.
    const anciennete = await within(panneau).findByText('Ancienneté du dû');
    const tranches = anciennete.nextElementSibling as HTMLElement;
    expect(within(tranches).getByText('31 à 60 jours').parentElement).toHaveTextContent(/31 à 60 jours\s*250\s000/u);
    expect(within(tranches).getByText('1 à 30 jours').parentElement).toHaveTextContent('—');
  });

  it('« Par bailleur » garde les tranches de l’agence, le total et les cautions avec leur nombre de bailleurs ; un bailleur filtre la liste', async () => {
    bureau(true);
    lignes = [ligne(1, 34)];
    const utilisateur = rendre();
    await screen.findByRole('button', { name: 'Ouvrir le dossier de Locataire 1' });

    await utilisateur.click(screen.getByRole('tab', { name: 'Par bailleur' }));

    expect((await screen.findAllByText('Plus de 90 jours')).length).toBeGreaterThan(0);
    expect(screen.getByText('Cautions détenues')).toBeInTheDocument();
    expect(screen.getByText('Aucun bailleur')).toBeInTheDocument();
    await utilisateur.click(screen.getByRole('button', { name: 'Mme Seck' }));
    await waitFor(() => expect(historiques().at(-1)?.get('filter[landlord_id]')).toBe('50'));
  });

  it('AC2 — une échéance encaissée depuis le dossier n’a plus de « Relancer »', async () => {
    bureau(true);
    lignes = [ligne(1, 34)];
    const utilisateur = rendre();
    await utilisateur.click(await screen.findByRole('button', { name: 'Ouvrir le dossier de Locataire 1' }));
    const panneau = await screen.findByRole('dialog');
    expect(within(panneau).getByRole('button', { name: /^Relancer$/ })).toBeInTheDocument();

    await utilisateur.click(within(panneau).getByRole('button', { name: 'Encaisser un paiement' }));
    await utilisateur.click(screen.getByRole('button', { name: 'simuler l’encaissement' }));

    await waitFor(() => expect(within(panneau).queryByRole('button', { name: /^Relancer$/ })).not.toBeInTheDocument());
    expect(within(panneau).getByRole('status')).toHaveTextContent('Échéance payée');
    expect(within(panneau).queryByRole('link', { name: /Ouvrir WhatsApp/ })).not.toBeInTheDocument();
  });

  it('« Relancer » d’une ligne ouvre le dossier sur la relance composée', async () => {
    bureau(true);
    lignes = [ligne(1, 34)];
    const utilisateur = rendre();
    const rangee = (await screen.findAllByRole('row')).find((r) => within(r).queryByText('Locataire 1'))!;

    await utilisateur.click(within(rangee).getByRole('button', { name: /Relancer/ }));

    const panneau = await screen.findByRole('dialog');
    const ouvrir = await within(panneau).findByRole('link', { name: /Ouvrir WhatsApp/ });
    expect(new URL(ouvrir.getAttribute('href')!).searchParams.get('text')).toContain(LIEN);
    // Le lien n'apparaît qu'une fois : celui de la relance, pas une seconde fois dans le dossier.
    expect(within(panneau).getAllByRole('button', { name: /Copier/ })).toHaveLength(1);
  });

  it('le dossier seul (clic sur la ligne) porte le lien de paiement et « Relancer » au pied', async () => {
    bureau(true);
    lignes = [ligne(1, 34)];
    const utilisateur = rendre();
    await utilisateur.click(await screen.findByRole('button', { name: 'Ouvrir le dossier de Locataire 1' }));

    const panneau = await screen.findByRole('dialog');
    expect(await within(panneau).findByText('Lien de paiement')).toBeInTheDocument();
    expect(within(panneau).getAllByRole('button', { name: /Copier/ })).toHaveLength(1);
    expect(within(panneau).queryByRole('link', { name: /Ouvrir WhatsApp/ })).not.toBeInTheDocument();
  });
});
