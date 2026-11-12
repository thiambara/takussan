/**
 * TCK-2664 — « Crédits : vendre la mise en avant depuis la page du solde ». La grille se lit de
 * l'API (AC1), le parcours achète par la route du bien et le solde suit (AC2), une offre que le solde
 * ne couvre pas dit ce qui manque (AC3), l'historique du téléphone garde le motif (AC4), un membre
 * sans `boost.spend` lit une page réservée (AC5), « Recharger » ne fait rien.
 *
 * Le réseau est doublé au niveau de `fetch` : les requêtes sont lues telles que l'API les reçoit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ToastProvider, Toaster } from '@/components/ui/toast';
import { withIntl } from '@/test/intl';

import { PageCredits } from '../PageCredits';

const etat = vi.hoisted(() => ({ telephone: false, roles: ['agency_admin'] as string[], nature: 'standard' as string }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/app/credits',
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton', user: { id: 1, roles: etat.roles } }) }));
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: () => etat.telephone }));

const produit = (id: number, kind: string, variant: string | null, jours: number, prix: number, actif = true) => ({
  id,
  kind,
  variant,
  duration_days: jours,
  price_credits: prix,
  is_active: actif,
  sort_order: id,
});

const PRODUITS = [
  produit(1, 'bump', null, 0, 5),
  produit(2, 'featured', null, 7, 20),
  produit(3, 'featured', null, 15, 35),
  produit(4, 'featured', null, 30, 60),
  produit(5, 'badge', 'urgent', 7, 10),
  produit(6, 'badge', 'price_drop', 7, 10),
];

const LOT = { id: 1, origin: 'admin_grant', initial_amount: 100, remaining_amount: 60, reason: 'Programme de lancement', expires_at: '2099-12-24T00:00:00Z', created_at: '2026-10-24T00:00:00Z' };

const MOUVEMENT = {
  id: 11,
  type: 'spend',
  amount: -20,
  credit_lot_id: 1,
  property_boost_id: 3,
  actor_id: 1,
  reason: 'Lancée par Awa Diop',
  created_at: '2026-11-05T09:12:00Z',
  boost: { id: 3, kind: 'featured', variant: null, property: { id: 42, title: 'Parcelle à Yoff' } },
};

const SUGGESTIONS = [
  { id: 42, title: 'Deux-pièces rénové', main_photo_url: null, quarter: 'Point E', views_count: 12, last_contact_at: null },
  { id: 43, title: 'Maison avec terrasse', main_photo_url: null, quarter: 'Liberté 6', views_count: 19, last_contact_at: null },
];

const BOOST_TERMINE = {
  id: 9,
  kind: 'featured',
  variant: null,
  status: 'ended',
  price_credits: 20,
  duration_days: 7,
  starts_at: '2026-10-28T00:00:00Z',
  ends_at: '2026-11-04T00:00:00Z',
  ended_at: '2026-11-04T00:00:00Z',
  property: { id: 44, title: 'Villa · Kaolack', main_photo_url: null, quarter: 'Kaolack' },
  measures: { impressions: 900, clicks: 380, contacts: 6, visits: 2 },
};

const TROUVE = { id: 77, title: 'Studio · Sacré-Cœur', main_photo_url: null, views_count: 8, location: { quarter: 'Sacré-Cœur', city: 'Dakar' } };

interface Appel {
  readonly url: string;
  readonly methode: string;
  readonly corps: unknown;
  readonly entetes: Record<string, string>;
}

interface Options {
  readonly solde?: number;
  readonly produits?: readonly unknown[];
  readonly statutCredits?: number;
  readonly refusAchat?: boolean;
  readonly boosts?: readonly unknown[];
  /** Les boosts en place du bien choisi (GET /properties/{id}/boosts). */
  readonly enPlace?: readonly unknown[];
}

const meta = (total: number, parPage: number, page = 1) => ({ current_page: page, last_page: Math.max(1, Math.ceil(total / parPage)), per_page: parPage, total, from: 1, to: Math.min(total, parPage) });

function routeur({ solde: soldeInitial = 60, produits = PRODUITS, statutCredits = 200, refusAchat = false, boosts = [BOOST_TERMINE], enPlace = [] }: Options = {}) {
  const appels: Appel[] = [];
  let solde = soldeInitial;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entree: RequestInfo | URL, init?: RequestInit) => {
      const url = decodeURIComponent(String(entree));
      const methode = init?.method ?? 'GET';
      appels.push({ url, methode, corps: typeof init?.body === 'string' ? JSON.parse(init.body) : null, entetes: Object.fromEntries(new Headers(init?.headers).entries()) });
      let statut = 200;
      let corps: unknown = {};
      if (url.includes('/api/me/profiles')) corps = { data: [{ id: 'p1', type: 'agency_admin', numeric_id: 1, agency_id: 3, agency: { id: 3, name: 'Agence', slug: 'agence', kind: etat.nature }, status: 'active' }], meta: { active_profile_id: 'p1' } };
      else if (url.includes('/api/credits/boosts')) corps = { data: boosts, meta: meta(boosts.length, 10) };
      else if (url.includes('/api/credits/suggestions')) corps = { data: SUGGESTIONS, meta: { total: 43 } };
      else if (url.includes('/api/credits')) {
        if (statutCredits !== 200) {
          statut = statutCredits;
          corps = { message: 'This action is unauthorized.' };
        } else {
          const parPage = Number(/per_page=(\d+)/.exec(url)?.[1] ?? 20);
          corps = { data: { balance: solde, lots: [{ ...LOT, remaining_amount: solde }] }, movements: [MOUVEMENT], meta: meta(42, parPage) };
        }
      } else if (url.includes('/api/boost-products')) corps = { data: produits };
      else if (/\/api\/properties\/\d+\/boosts/.test(url)) {
        if (methode === 'POST') {
          const p = produits.find((x) => (x as { id: number }).id === (JSON.parse(String(init?.body)) as { product_id: number }).product_id) as { price_credits: number };
          if (refusAchat) {
            statut = 422;
            corps = { code: 'credits.insufficient', params: { missing: 7, balance: solde } };
          } else {
            solde -= p.price_credits;
            corps = { data: { id: 99 }, balance: solde };
          }
        } else corps = { data: enPlace, bump_available_at: null };
      } else if (url.includes('/api/properties')) {
        const q = /filter\[search\]=([^&]+)/.exec(url)?.[1];
        corps = q ? { data: [TROUVE], meta: meta(1, 10) } : { data: [], meta: meta(67, 10) };
      }
      return { ok: statut < 400, status: statut, headers: new Headers(), json: async () => corps, text: async () => JSON.stringify(corps) };
    }),
  );
  return appels;
}

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <PageCredits />
          <Toaster />
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

const soldeAffiche = () => document.querySelector('[data-slot=carte-solde]') as HTMLElement;

beforeEach(() => {
  etat.telephone = false;
  etat.roles = ['agency_admin'];
  etat.nature = 'standard';
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('TCK-2664 — la page Crédits', () => {
  it('AC1 — la grille dit le prix que l’API rend (Vedette 7 jours à 25), jamais un prix écrit dans le code', async () => {
    routeur({ produits: [produit(2, 'featured', null, 7, 25), produit(3, 'featured', null, 15, 35), produit(1, 'bump', null, 0, 5)] });
    rendre();
    const grille = await screen.findByText(/7 j : 25/);
    expect(grille).toHaveTextContent('7 j : 25 · 15 j : 35 crédits');
    expect(document.querySelector('[data-slot=grille-des-offres]')).not.toHaveTextContent('7 j : 20');
    // Une famille sans offre active n'est pas dans la grille.
    expect(document.querySelector('[data-slot=grille-des-offres]')).not.toHaveTextContent('Urgent');
  });

  it('AC2 — « Vedette 7 jours » sur un bien : POST à la route du bien avec l’offre, puis le solde baisse sans rechargement', async () => {
    const appels = routeur();
    const u = userEvent.setup();
    rendre();
    await waitFor(() => expect(soldeAffiche()).toHaveTextContent('60'));

    await u.click(screen.getByRole('button', { name: 'Mettre un bien en avant' }));
    const dialogue = await screen.findByRole('dialog', { name: 'Mettre un bien en avant' });
    await u.click(await within(dialogue).findByRole('radio', { name: /Deux-pièces rénové/ }));
    await u.click(within(dialogue).getByRole('radio', { name: /^7 jours/ }));
    expect(within(dialogue).getByText(/Il vous restera/)).toHaveTextContent('Il vous restera 40 crédits sur 60');

    const confirmer = within(dialogue).getByRole('button', { name: 'Mettre en avant · 20 crédits' });
    await waitFor(() => expect(confirmer).toBeEnabled());
    await u.click(confirmer);

    await waitFor(() => expect(appels.filter((a) => a.methode === 'POST')).toHaveLength(1));
    const achat = appels.find((a) => a.methode === 'POST')!;
    expect(achat.url).toContain('/api/properties/42/boosts');
    expect(achat.corps).toEqual({ product_id: 2 });
    expect(achat.entetes['idempotency-key']).toMatch(/-42-2$/);

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Mettre un bien en avant' })).not.toBeInTheDocument());
    await waitFor(() => expect(soldeAffiche()).toHaveTextContent('40'));
    expect(await screen.findByText('« Deux-pièces rénové » est mis en avant : Vedette 7 jours.')).toBeInTheDocument();
  });

  it('deux achats du même bien et de la même offre, l’un après l’autre, portent deux clés d’idempotence', async () => {
    const appels = routeur();
    const u = userEvent.setup();
    rendre();
    for (const reste of ['50', '40']) {
      await u.click(await screen.findByRole('button', { name: 'Mettre un bien en avant' }));
      const dialogue = await screen.findByRole('dialog', { name: 'Mettre un bien en avant' });
      await u.click(await within(dialogue).findByRole('radio', { name: /Deux-pièces rénové/ }));
      await u.click(within(dialogue).getByRole('radio', { name: /Urgent/ }));
      const confirmer = within(dialogue).getByRole('button', { name: 'Mettre en avant · 10 crédits' });
      await waitFor(() => expect(confirmer).toBeEnabled());
      await u.click(confirmer);
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Mettre un bien en avant' })).not.toBeInTheDocument());
      await waitFor(() => expect(soldeAffiche()).toHaveTextContent(reste));
    }
    const cles = appels.filter((a) => a.methode === 'POST').map((a) => a.entetes['idempotency-key']);
    expect(cles).toHaveLength(2);
    expect(cles[0]).not.toBe(cles[1]);
  });

  it('AC3 — avec 10 crédits, la Vedette (20) est désactivée et sa raison est à côté', async () => {
    routeur({ solde: 10 });
    const u = userEvent.setup();
    rendre();
    await u.click(await screen.findByRole('button', { name: 'Mettre un bien en avant' }));
    const dialogue = await screen.findByRole('dialog');
    const vedette = await within(dialogue).findByRole('radio', { name: /^Vedette/ });
    expect(vedette).toHaveAttribute('aria-disabled', 'true');
    const raison = document.getElementById(vedette.getAttribute('aria-describedby') ?? '');
    expect(raison).toHaveTextContent('Il vous manque 10 crédits');
    // Chaque durée trop chère est désactivée et dit ce qui manque ; l'offre couverte reste choisissable.
    expect(within(dialogue).getByRole('radio', { name: /^7 jours/ })).toHaveAttribute('aria-disabled', 'true');
    expect(within(dialogue).getByRole('radio', { name: /^30 jours/ })).toHaveTextContent('il en manque 50');
    expect(within(dialogue).getByRole('radio', { name: /Urgent/ })).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('le refus « solde insuffisant » du serveur est dit dans le parcours', async () => {
    routeur({ refusAchat: true });
    const u = userEvent.setup();
    rendre();
    await u.click(await screen.findByRole('button', { name: 'Mettre un bien en avant' }));
    const dialogue = await screen.findByRole('dialog');
    await u.click(await within(dialogue).findByRole('radio', { name: /Deux-pièces rénové/ }));
    await u.click(within(dialogue).getByRole('radio', { name: /Urgent/ }));
    const confirmer = within(dialogue).getByRole('button', { name: 'Mettre en avant · 10 crédits' });
    await waitFor(() => expect(confirmer).toBeEnabled());
    await u.click(confirmer);
    expect(await within(dialogue).findByRole('alert')).toHaveTextContent('Il vous manque 7 crédits');
  });

  it('« Remonter · 5 » ouvre le parcours sur ce bien et la Remontée ; « Relancer » sur l’offre active de même durée', async () => {
    routeur();
    const u = userEvent.setup();
    rendre();
    await u.click(await screen.findByRole('button', { name: 'Remonter « Maison avec terrasse » pour 5 crédits' }));
    let dialogue = await screen.findByRole('dialog');
    expect(await within(dialogue).findByRole('radio', { name: /Maison avec terrasse/ })).toBeChecked();
    expect(within(dialogue).getByRole('radio', { name: /Remontée/ })).toBeChecked();
    await waitFor(() => expect(within(dialogue).getByRole('button', { name: 'Mettre en avant · 5 crédits' })).toBeEnabled());
    await u.click(within(dialogue).getAllByRole('button', { name: 'Fermer' }).find((b) => b.textContent === 'Fermer')!);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await u.click(screen.getByRole('button', { name: 'Relancer la mise en avant de « Villa · Kaolack » pour 20 crédits' }));
    dialogue = await screen.findByRole('dialog');
    expect(await within(dialogue).findByRole('radio', { name: /Villa · Kaolack/ })).toBeChecked();
    expect(within(dialogue).getByRole('radio', { name: /^7 jours/ })).toBeChecked();
    // La confirmation dit ce qui sera dépensé et ce qui restera.
    expect(await within(dialogue).findByRole('button', { name: 'Mettre en avant · 20 crédits' })).toBeInTheDocument();
    expect(within(dialogue).getByText(/Il vous restera/)).toHaveTextContent('Il vous restera 40 crédits sur 60');
    // Et la ligne : « Vedette 7 j ».
    const rangees = screen.getAllByText('Villa · Kaolack').map((e) => e.closest('[role=row]')).filter(Boolean);
    expect(rangees[0]).toHaveTextContent('Vedette 7 j');
  });

  it('l’effet sur la Vedette en place est dit avant de confirmer, avec les phrases de la fenêtre d’achat', async () => {
    routeur({ enPlace: [{ id: 5, kind: 'featured', variant: null, status: 'active', ends_at: '2026-11-20T00:00:00Z' }] });
    const u = userEvent.setup();
    rendre();
    await u.click(await screen.findByRole('button', { name: 'Relancer la mise en avant de « Villa · Kaolack » pour 20 crédits' }));
    const dialogue = await screen.findByRole('dialog');
    expect(await within(dialogue).findByText(/^Prolonge la Vedette en cours jusqu’au/)).toHaveTextContent('Prolonge la Vedette en cours jusqu’au 27 nov. 2026.'); // 20 nov. + 7 jours
  });

  it('la recherche porte sur les biens EN LIGNE côté serveur, et le bien choisi reste à l’écran quand on efface', async () => {
    const appels = routeur();
    const u = userEvent.setup();
    rendre();
    await u.click(await screen.findByRole('button', { name: 'Mettre un bien en avant' }));
    const dialogue = await screen.findByRole('dialog');
    await u.type(await within(dialogue).findByRole('searchbox', { name: /Chercher un bien en ligne/ }), 'Sacré');
    const trouve = await within(dialogue).findByRole('radio', { name: /Studio · Sacré-Cœur/ });
    const requete = appels.find((a) => a.url.includes('filter[search]=Sacré'))!;
    expect(requete.url).toContain('filter[public]=1');
    expect(within(dialogue).getByText(/Sacré-Cœur · 8 vues/)).toBeInTheDocument();
    await u.click(trouve);
    await u.clear(within(dialogue).getByRole('searchbox', { name: /Chercher un bien en ligne/ }));
    // Retour aux suggestions : le bien choisi y est, en tête, toujours coché.
    await within(dialogue).findByRole('radio', { name: /Deux-pièces rénové/ });
    expect(within(dialogue).getByRole('radio', { name: /Studio · Sacré-Cœur/ })).toBeChecked();
    await u.click(within(dialogue).getByRole('radio', { name: /Urgent/ }));
    const confirmer = within(dialogue).getByRole('button', { name: 'Mettre en avant · 10 crédits' });
    await waitFor(() => expect(confirmer).toBeEnabled());
    await u.click(confirmer);
    await waitFor(() => expect(appels.find((a) => a.methode === 'POST')?.url).toContain('/api/properties/77/boosts'));
  });

  it('« Relancer » rachète l’offre active de même famille et de même durée, à son prix d’aujourd’hui ; une Vedette prolongée (14 j) n’en a pas', async () => {
    const prolongee = { ...BOOST_TERMINE, duration_days: 14, price_credits: 40 };
    const badge = { ...BOOST_TERMINE, id: 10, kind: 'badge', variant: 'urgent', price_credits: 8, status: 'cancelled', property: { ...BOOST_TERMINE.property, id: 45, title: 'Studio · Fann' } };
    routeur({ boosts: [prolongee, badge] });
    rendre();
    // Le badge a été payé 8 : on le relance au prix de l'offre d'aujourd'hui (10).
    expect(await screen.findByRole('button', { name: 'Relancer la mise en avant de « Studio · Fann » pour 10 crédits' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Relancer la mise en avant de « Villa · Kaolack »/ })).not.toBeInTheDocument();
    const rangee = screen.getByText('Villa · Kaolack').closest('[role=row]') as HTMLElement;
    expect(rangee).toHaveTextContent('Vedette 14 j');
    // Une mise en avant annulée ne se dit pas « terminée ».
    expect(screen.getByText('Studio · Fann').closest('[role=row]')).toHaveTextContent('annulée le 4 nov.');
  });

  it('sans Remontée active, aucun « Remonter » ; les mesures sont celles de l’API (380 vues = les clics)', async () => {
    routeur({ produits: PRODUITS.filter((p) => p.kind !== 'bump') });
    rendre();
    expect(await screen.findByText('Deux-pièces rénové')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remonter/ })).not.toBeInTheDocument();
    const rangee = screen.getByText('Villa · Kaolack').closest('[role=row]') as HTMLElement;
    expect(rangee).toHaveTextContent('380');
    expect(rangee).not.toHaveTextContent('900');
  });

  it('« Recharger » est inerte : annoncé indisponible, « Bientôt », et le clic n’envoie rien', async () => {
    const appels = routeur();
    const u = userEvent.setup();
    rendre();
    const recharger = await screen.findByRole('button', { name: /Recharger/ });
    expect(recharger).toHaveAttribute('aria-disabled', 'true');
    expect(recharger).toHaveTextContent('Bientôt');
    expect(recharger).not.toHaveTextContent(/F\s?CFA/);
    const avant = appels.length;
    await u.click(recharger);
    expect(appels.slice(avant).filter((a) => a.methode !== 'GET')).toHaveLength(0);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('le libellé du solde suit l’espace actif : « de l’agence » en agence, « de votre espace » pour l’hôte, admin de son propre espace', async () => {
    routeur();
    const { unmount } = rendre();
    await waitFor(() => expect(soldeAffiche()).toHaveTextContent('Solde de l’agence'));
    unmount();
    // L'hôte de démo (utilisateur 50) est `agency_admin` : le rôle ne les distingue pas, l'espace si.
    etat.nature = 'individual';
    rendre();
    await waitFor(() => expect(soldeAffiche()).toHaveTextContent('Solde de votre espace'));
  });

  it('AC5 — un membre sans `boost.spend` (403) lit que la page est réservée, sans erreur générique, et rien d’autre ne part', async () => {
    const appels = routeur({ statutCredits: 403 });
    rendre();
    expect(await screen.findByText('Cette page est réservée aux administrateurs de l’espace')).toBeInTheDocument();
    expect(screen.queryByText('Impossible de charger les crédits.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Réessayer/ })).not.toBeInTheDocument();
    expect(appels.some((a) => /credits\/(boosts|suggestions)|boost-products|\/api\/properties/.test(a.url))).toBe(false);
  });

  it('une autre panne que le 403 garde l’erreur et « Réessayer »', async () => {
    routeur({ statutCredits: 500 });
    rendre();
    expect(await screen.findByText('Impossible de charger les crédits.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});

describe('TCK-2664 — au téléphone', () => {
  it('AC4 — l’historique en liste : l’objet mène au bien, le motif est à l’écran, sur trois lignes au plus', async () => {
    etat.telephone = true;
    routeur();
    const u = userEvent.setup();
    rendre();
    await u.click(await screen.findByRole('button', { name: /Historique/ }));
    const panneau = await screen.findByRole('dialog', { name: 'Historique' });
    const ligne = (await within(panneau).findByText(/Lancée par Awa Diop/)).closest('[data-slot=ligne-d-operation]') as HTMLElement;
    expect(within(ligne).getByRole('link', { name: 'Vedette — Parcelle à Yoff' })).toHaveAttribute('href', '/app/properties/42');
    // Une ligne de titre (tronquée) et un détail borné à deux lignes : trois au plus.
    expect(within(ligne).getByRole('link').closest('p')).toHaveClass('truncate');
    const detail = within(ligne).getByText(/Lancée par Awa Diop/);
    expect(detail).toHaveClass('line-clamp-2');
    expect(detail).toHaveTextContent('Mise en avant · 5 nov., 09:12 · Lancée par Awa Diop');
  });

  it('le résumé des liens : dernière opération et lots', async () => {
    etat.telephone = true;
    routeur();
    rendre();
    expect(await screen.findByText('Dernière opération : 5 nov. · −20 crédits')).toBeInTheDocument();
    expect(screen.getByText(/1 lot · 60 sur 100 · expire le 24 déc\./)).toBeInTheDocument();
  });
});
