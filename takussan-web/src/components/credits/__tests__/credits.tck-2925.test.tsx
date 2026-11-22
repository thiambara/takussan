/**
 * TCK-2925 — la page Crédits : « × plus de vues que la semaine d'avant » (AC1), le « Rapport des 30
 * derniers jours » (AC2) et les « Lots épuisés ou expirés » (AC3).
 *
 * Le réseau est doublé au niveau de `fetch` : les requêtes sont lues telles que l'API les reçoit.
 * Les routes les plus longues d'abord (`/api/credits/boosts/report` avant `/api/credits/boosts`,
 * `/api/credits/lots` avant `/api/credits`) : sinon la mauvaise branche répond sans bruit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ToastProvider, Toaster } from '@/components/ui/toast';
import { withIntl } from '@/test/intl';

import { rapportDeVues } from '../lecture';
import { PageCredits } from '../PageCredits';

const etat = vi.hoisted(() => ({ telephone: false }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/app/credits',
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton', user: { id: 1, roles: ['agency_admin'] } }) }));
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: () => etat.telephone }));

const LOT_VIVANT = { id: 1, origin: 'admin_grant', initial_amount: 100, remaining_amount: 60, reason: 'Lot vivant', expires_at: '2099-12-24T00:00:00Z', created_at: '2026-10-24T00:00:00Z' };

/** Vedette 7 j terminée : fenêtre de `views_7d` = 7 jours pleins (28 oct. → 4 nov.). */
const boost = (vues7j: number, avant: number) => ({
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
  views_7d: vues7j,
  views_prev_7d: avant,
});

const JOURS = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 9, 17 + i));
  return { date: d.toISOString().slice(0, 10), impressions: i, clicks: i % 3, views: i % 5 };
});

const RAPPORT = {
  data: {
    days: JOURS,
    boosts: [
      { id: 9, kind: 'featured', variant: null, status: 'ended', starts_at: '2026-10-28T00:00:00Z', ended_at: '2026-11-04T00:00:00Z', property: { id: 44, title: 'Villa · Kaolack', main_photo_url: null, quarter: 'Kaolack' }, impressions: 317, clicks: 29, views: 53 },
      { id: 12, kind: 'bump', variant: null, status: 'ended', starts_at: '2026-11-10T00:00:00Z', ended_at: '2026-11-10T00:00:00Z', property: { id: 45, title: 'Parcelle à Yoff', main_photo_url: null, quarter: 'Yoff' }, impressions: 118, clicks: 4, views: 7 },
    ],
  },
  meta: { days: 30, from: JOURS[0].date, to: JOURS[29].date },
};

const LOTS_PASSES = [
  { id: 7, origin: 'welcome', initial_amount: 50, remaining_amount: 0, reason: null, expires_at: null, created_at: '2026-09-01T00:00:00Z', state: 'spent' },
  { id: 5, origin: 'admin_grant', initial_amount: 100, remaining_amount: 0, reason: 'Programme de lancement', expires_at: '2026-10-31T00:00:00Z', created_at: '2026-08-01T00:00:00Z', state: 'expired' },
];

const meta = (total: number, parPage: number) => ({ current_page: 1, last_page: Math.max(1, Math.ceil(total / parPage)), per_page: parPage, total, from: 1, to: Math.min(total, parPage) });

function routeur({ boosts = [boost(30, 10)], lotsPasses = LOTS_PASSES }: { readonly boosts?: readonly unknown[]; readonly lotsPasses?: readonly unknown[] } = {}) {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entree: RequestInfo | URL) => {
      const url = decodeURIComponent(String(entree));
      urls.push(url);
      let corps: unknown = {};
      if (url.includes('/api/me/profiles')) corps = { data: [{ id: 'p1', type: 'agency_admin', numeric_id: 1, agency_id: 3, agency: { id: 3, name: 'Agence', slug: 'agence', kind: 'standard' }, status: 'active' }], meta: { active_profile_id: 'p1' } };
      else if (url.includes('/api/credits/boosts/report')) corps = RAPPORT;
      else if (url.includes('/api/credits/boosts')) corps = { data: boosts, meta: meta(boosts.length, 10) };
      else if (url.includes('/api/credits/suggestions')) corps = { data: [], meta: { total: 0 } };
      else if (url.includes('/api/credits/lots')) corps = { data: lotsPasses, meta: meta(lotsPasses.length, 20) };
      else if (url.includes('/api/credits')) corps = { data: { balance: 60, lots: [LOT_VIVANT] }, movements: [], meta: meta(0, 5) };
      else if (url.includes('/api/boost-products')) corps = { data: [] };
      return { ok: true, status: 200, headers: new Headers(), json: async () => corps, text: async () => JSON.stringify(corps) };
    }),
  );
  return urls;
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

beforeEach(() => {
  etat.telephone = false;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('TCK-2925 — rapportDeVues', () => {
  const jour = (j: string) => `${j}T00:00:00Z`;
  const MAINTENANT = Date.parse('2026-11-15T12:00:00Z');

  it('30 vues contre 10 sur 7 jours pleins → 3', () => {
    expect(rapportDeVues({ starts_at: jour('2026-10-28'), ended_at: jour('2026-11-04'), views_7d: 30, views_prev_7d: 10 }, MAINTENANT)).toBe(3);
  });

  it('arrondi au dixième : 214 contre 61 → 3,5', () => {
    expect(rapportDeVues({ starts_at: jour('2026-10-28'), ended_at: jour('2026-11-04'), views_7d: 214, views_prev_7d: 61 }, MAINTENANT)).toBe(3.5);
  });

  it('aucune vue la semaine d’avant (ou champ absent) → aucune ligne, jamais Infinity', () => {
    expect(rapportDeVues({ starts_at: jour('2026-10-28'), ended_at: jour('2026-11-04'), views_7d: 30, views_prev_7d: 0 }, MAINTENANT)).toBeNull();
    expect(rapportDeVues({ starts_at: jour('2026-10-28'), ended_at: jour('2026-11-04') }, MAINTENANT)).toBeNull();
  });

  it('une Remontée (1 jour) ne compare pas un jour à une semaine', () => {
    expect(rapportDeVues({ starts_at: '2026-11-10T08:00:00Z', ended_at: '2026-11-10T08:00:00Z', views_7d: 30, views_prev_7d: 10 }, MAINTENANT)).toBeNull();
  });

  it('en cours : la fin est aujourd’hui (jamais `ends_at`) — 3 jours → rien, 7 jours → le rapport', () => {
    expect(rapportDeVues({ starts_at: jour('2026-11-13'), ended_at: null, views_7d: 30, views_prev_7d: 10 }, MAINTENANT)).toBeNull();
    expect(rapportDeVues({ starts_at: jour('2026-11-09'), ended_at: null, views_7d: 30, views_prev_7d: 10 }, MAINTENANT)).toBe(3);
  });

  it('pas de hausse → aucune ligne (« 0,5 × plus de vues » serait faux)', () => {
    expect(rapportDeVues({ starts_at: jour('2026-10-28'), ended_at: jour('2026-11-04'), views_7d: 5, views_prev_7d: 10 }, MAINTENANT)).toBeNull();
    expect(rapportDeVues({ starts_at: jour('2026-10-28'), ended_at: jour('2026-11-04'), views_7d: 101, views_prev_7d: 100 }, MAINTENANT)).toBeNull();
  });
});

describe('TCK-2925 — la page Crédits', () => {
  it('AC1 — téléphone : « 3,0 × plus de vues que la semaine d’avant » sous les mesures', async () => {
    etat.telephone = true;
    routeur();
    rendre();
    const ligne = await screen.findByText('3,0 × plus de vues que la semaine d’avant');
    expect(ligne).toHaveAttribute('data-slot', 'comparaison-de-vues');
  });

  it('AC1 — bureau : « 3,0 × la sem. d’avant » sous le nombre de vues', async () => {
    routeur();
    rendre();
    const cellule = (await screen.findByText('3,0 × la sem. d’avant')).closest('[role=cell]');
    expect(cellule).toHaveTextContent('380');
  });

  it('AC1 — à `views_prev_7d: 0`, aucune ligne de comparaison (ni téléphone ni bureau)', async () => {
    for (const telephone of [false, true]) {
      etat.telephone = telephone;
      routeur({ boosts: [boost(30, 0)] });
      const { unmount } = rendre();
      await screen.findAllByText('Villa · Kaolack');
      expect(document.querySelector('[data-slot=comparaison-de-vues]')).toBeNull();
      expect(document.body).not.toHaveTextContent(/Infinity|× plus de vues|× la sem/);
      unmount();
      vi.unstubAllGlobals();
    }
  });

  it('AC2 — « Rapport des 30 derniers jours » ouvre un panneau : 30 jours, et les totaux de l’API par mise en avant', async () => {
    const urls = routeur();
    const u = userEvent.setup();
    rendre();
    await u.click(await screen.findByRole('button', { name: 'Rapport des 30 derniers jours' }));
    const panneau = await screen.findByRole('dialog', { name: 'Rapport des 30 derniers jours' });
    await waitFor(() => expect(panneau.querySelectorAll('[data-slot=rapport-jour]')).toHaveLength(30));
    expect(urls.some((x) => x.includes('/api/credits/boosts/report') && x.includes('days=30'))).toBe(true);

    const lignes = [...panneau.querySelectorAll('[data-slot=rapport-mise-en-avant]')] as HTMLElement[];
    expect(lignes).toHaveLength(2);
    const villa = lignes[0];
    expect(villa).toHaveTextContent('Villa · Kaolack');
    // Une mise en avant terminée dit sa période, pas « depuis ».
    expect(villa).toHaveTextContent('du 28 oct. au 4 nov.');
    expect(within(villa).getByText('Affichages').nextElementSibling).toHaveTextContent('317');
    expect(within(villa).getByText('Vues').nextElementSibling).toHaveTextContent('29');
    expect(within(villa).getByText('Consultations').nextElementSibling).toHaveTextContent('53');
    expect(within(lignes[1]).getByText('Affichages').nextElementSibling).toHaveTextContent('118');
  });

  it('AC3 — « Lots épuisés ou expirés » lit `GET /api/credits/lots` (champs choisis, aucun filtre client) et dit l’état et la date', async () => {
    const urls = routeur();
    const u = userEvent.setup();
    rendre();
    await u.click(await screen.findByRole('button', { name: 'Lots épuisés ou expirés' }));
    const panneau = await screen.findByRole('dialog', { name: 'Lots épuisés ou expirés' });
    await waitFor(() => expect(panneau.querySelectorAll('[data-slot=lot-passe]')).toHaveLength(2));
    const appel = urls.find((x) => x.includes('/api/credits/lots'))!;
    expect(appel).toContain('fields[credit_lots]=id,origin,initial_amount,remaining_amount,expires_at,reason,created_at');
    expect(appel).not.toContain('filter[state]');

    const [epuise, expire] = [...panneau.querySelectorAll('[data-slot=lot-passe]')] as HTMLElement[];
    expect(epuise).toHaveTextContent('Offre de bienvenue');
    expect(epuise).toHaveTextContent('Épuisé');
    expect(epuise).toHaveTextContent('50 crédits reçus le 1 sept.');
    expect(expire).toHaveTextContent('Expiré');
    expect(expire).toHaveTextContent('expiré le 31 oct.');
    // Le lot vivant de `GET /api/credits` n'y paraît pas.
    expect(panneau).not.toHaveTextContent('Lot vivant');
  });

  it('AC3 — aucun lot passé → la phrase d’état vide', async () => {
    routeur({ lotsPasses: [] });
    const u = userEvent.setup();
    rendre();
    await u.click(await screen.findByRole('button', { name: 'Lots épuisés ou expirés' }));
    const panneau = await screen.findByRole('dialog', { name: 'Lots épuisés ou expirés' });
    expect(await within(panneau).findByText('Aucun lot épuisé ou expiré.')).toBeInTheDocument();
  });

  it('téléphone — la ligne « Lots de crédits » mène aux lots vivants puis aux lots passés', async () => {
    etat.telephone = true;
    routeur();
    const u = userEvent.setup();
    rendre();
    await u.click(await screen.findByRole('button', { name: /Lots de crédits/ }));
    const panneau = await screen.findByRole('dialog', { name: 'Lots de crédits' });
    expect(within(panneau).getByText('Lots épuisés ou expirés')).toBeInTheDocument();
    await waitFor(() => expect(panneau.querySelectorAll('[data-slot=lot-passe]')).toHaveLength(2));
    expect(panneau.querySelectorAll('[data-slot=lot-de-credits]')).toHaveLength(1);
  });
});
