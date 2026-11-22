/**
 * TCK-2857 — « Tâches » : l'aide du balayage au téléphone ; « Grouper par » et « Rattachée à », « Plus
 * tard » en tableau avec « Reporter · Modifier » au bureau ; « Nouvelle tâche » préremplie et « Annuler ».
 * Même doublure réseau que `PageDesTaches.tck-2596.test.tsx` (au niveau d'`apiRequest`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';

import { lireEtat } from '@/lib/taches/taches';
import { withIntl } from '@/test/intl';

import { PageDesTaches } from '../PageDesTaches';

const etat = vi.hoisted(() => ({
  appels: [] as { chemin: string; methode: string; corps: unknown }[],
  taches: [] as unknown[],
  dernierePage: 1,
  panne: false,
  membresRefuses: false,
}));

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 7, first_name: 'Sokhna', last_name: 'Sene', roles: ['agent'], agency_id: 3 }, token: 'jeton' }) }));
const media = vi.hoisted(() => ({ bureau: false }));
// Le téléphone (rien) ou le bureau large (dès `md` et `xl`).
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: () => media.bureau }));
vi.mock('@/components/layout/en-tete-de-la-coque', () => ({ DeclarerEnTete: () => null }));
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/app/tasks' }));

const SOKHNA = { id: 7, name: 'Sokhna Sene' };
const SERIGNE = { id: 6, name: 'Serigne Ndoye' };
const tache = (o: Record<string, unknown>) => ({ status: 'open', priority: 'medium', assignee: SOKHNA, creator: SOKHNA, taskable: null, due_at: null, created_at: '2026-10-09T10:00:00Z', ...o });
const EN_RETARD = tache({
  id: 1,
  title: 'Faire signer l’état des lieux d’entrée',
  due_at: '2026-10-17T09:00:00Z',
  creator: SERIGNE,
  taskable: { type: 'property', id: 8, label: 'F2 Grand Yoff', phone: null },
});
const DU_JOUR = tache({
  id: 3,
  title: 'Relancer Yacine (offre villa)',
  due_at: '2026-11-10T18:00:00Z',
  taskable: { type: 'customer', id: 4, label: 'Yacine Diouf', phone: '+221706190713' },
});

vi.mock('@/lib/api', async (original) => {
  const vrai = await original<typeof import('@/lib/api')>();
  return {
    ...vrai,
    apiRequest: vi.fn(async (chemin: string, options: { method?: string; body?: unknown } = {}) => {
      const methode = options.method ?? 'GET';
      etat.appels.push({ chemin, methode, corps: options.body });
      if (methode === 'PATCH') return { data: { ...(etat.taches.find((t) => chemin.endsWith(`/${(t as { id: number }).id}`)) as object), ...(options.body as object) } };
      if (methode === 'POST') return { data: tache({ id: 99, title: (options.body as { title: string }).title }) };
      if (methode !== 'GET') return null;
      const [route, qs] = chemin.split('?');
      const p = new URLSearchParams(qs ?? '');
      const page = (data: unknown[], total = data.length, derniere = 1) => ({ data, meta: { total, per_page: 30, current_page: Number(p.get('page') ?? 1), last_page: derniere } });
      if (route === '/api/tasks') {
        if (p.get('per_page') === '1') {
          const n = p.get('filter[status]') === 'done' ? 12 : ({ overdue: 2, today: 3, upcoming: 4, none: 0 } as Record<string, number>)[p.get('filter[due]') ?? ''] ?? 0;
          return page([], n);
        }
        if (etat.panne) throw new vrai.ApiError(500, { message: 'x' });
        return page(etat.taches, etat.taches.length, etat.dernierePage);
      }
      if (route.startsWith('/api/agencies/3/members')) {
        if (etat.membresRefuses) throw new vrai.ApiError(403, { message: 'non' });
        return page([{ id: 6, first_name: 'Serigne', last_name: 'Ndoye' }]);
      }
      if (route === '/api/customers') return page([{ id: 4, first_name: 'Mariama', last_name: 'Fall' }]);
      if (route === '/api/properties') return page([{ id: 8, title: 'F2 Grand Yoff' }]);
      return page([]);
    }),
  };
});

/** Mardi 10 novembre 2026, 10:12 à Dakar. */
const MAINTENANT = new Date('2026-11-10T10:12:00Z');

function monter(params: Record<string, string> = {}, props: { ouvrirNouvelle?: boolean; equipeVisible?: boolean; rattachement?: { type: 'customer' | 'property'; id: number; label: string } | null } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{withIntl(<PageDesTaches etatInitial={lireEtat(params)} {...props} />)}</QueryClientProvider>);
}

const lectures = () =>
  etat.appels.filter((a) => a.methode === 'GET' && a.chemin.startsWith('/api/tasks?')).map((a) => new URLSearchParams(a.chemin.split('?')[1] ?? ''));
const listes = () => lectures().filter((p) => p.get('per_page') === '30');
const ecritures = (methode: string) => etat.appels.filter((a) => a.methode === methode);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(MAINTENANT);
  Object.assign(etat, { appels: [], taches: [EN_RETARD, DU_JOUR], dernierePage: 1, panne: false, membresRefuses: false });
  media.bureau = false;
  replace.mockReset();
});
afterEach(() => vi.useRealTimers());

const PLUS_TARD = tache({
  id: 5,
  title: 'Renouveler le bail de Moussa',
  due_at: '2026-11-20T09:00:00Z',
  taskable: { type: 'customer', id: 4, label: 'Yacine Diouf', phone: null },
});
const SANS_ECHEANCE = tache({ id: 6, title: 'Mettre à jour la fiche de l’agence', due_at: null, taskable: null });

describe('TCK-2857 — l’aide du balayage (téléphone)', () => {
  it('AC1 — le texte de l’aide est rendu sous le premier groupe', async () => {
    monter();
    const retard = await screen.findByRole('region', { name: 'En retard' });
    expect(within(retard).getByText('Balayer à droite : fait. À gauche : reporter (demain, lundi, choisir).')).toBeInTheDocument();
    expect(screen.getAllByText(/^Balayer à droite/)).toHaveLength(1);
  });
});

describe('TCK-2857 — Grouper par, Rattachée à (bureau)', () => {
  beforeEach(() => {
    media.bureau = true;
  });

  it('AC2 — « Rattachée à : Clients » part en filter[taskable_type] (liste et comptes) et s’écrit dans l’URL', async () => {
    monter({ 'filter[due]': 'today' });
    await screen.findByText('Relancer Yacine (offre villa)');
    await userEvent.click(screen.getByRole('combobox', { name: 'Rattachée à' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Clients' }));
    await waitFor(() => expect(listes().some((p) => p.get('filter[taskable_type]') === 'App\\Models\\Customer')).toBe(true));
    const derniere = listes().at(-1)!;
    expect([derniere.get('filter[taskable_type]'), derniere.get('filter[due]')]).toEqual(['App\\Models\\Customer', 'today']);
    expect(lectures().filter((p) => p.get('per_page') === '1' && p.get('filter[taskable_type]') === 'App\\Models\\Customer').length).toBeGreaterThan(0);
    expect(replace).toHaveBeenLastCalledWith('/app/tasks?filter[due]=today&rattachement=clients', { scroll: false });
  });

  it('AC2 — « Grouper par : Rattachement » range les tâches par client ou bien, les non rattachées à part', async () => {
    etat.taches = [EN_RETARD, DU_JOUR, PLUS_TARD, SANS_ECHEANCE];
    monter({ grouper: 'rattachement' });
    const yacine = await screen.findByRole('region', { name: 'Yacine Diouf' });
    expect(within(yacine).getByText('Relancer Yacine (offre villa)')).toBeInTheDocument();
    expect(within(yacine).getByText('Renouveler le bail de Moussa')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'F2 Grand Yoff' })).getByText('Faire signer l’état des lieux d’entrée')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Sans rattachement' })).getByText('Mettre à jour la fiche de l’agence')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'En retard' })).toBeNull();
  });
});

describe('TCK-2857 — « Plus tard » en tableau (bureau)', () => {
  beforeEach(() => {
    media.bureau = true;
    etat.taches = [EN_RETARD, PLUS_TARD, SANS_ECHEANCE];
  });

  it('AC3 — un tableau dont chaque ligne porte « Reporter » et « Modifier »', async () => {
    monter({ 'filter[due]': 'all' });
    const plusTard = await screen.findByRole('region', { name: 'Plus tard' });
    const tableau = within(plusTard).getByRole('table');
    const ligne = within(tableau).getByRole('row', { name: /Renouveler le bail de Moussa/ });
    expect(within(ligne).getByText('Yacine Diouf')).toBeInTheDocument();
    expect(within(ligne).getByRole('button', { name: 'Reporter « Renouveler le bail de Moussa »' })).toBeInTheDocument();
    expect(within(ligne).getByRole('button', { name: 'Modifier « Renouveler le bail de Moussa »' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Sans échéance' })).getByRole('table')).toBeInTheDocument();
    // Les colonnes de tête restent des listes.
    expect(within(screen.getByRole('region', { name: 'En retard' })).queryByRole('table')).toBeNull();
  });

  it('AC3 — « Reporter › Demain » envoie le lendemain 09:00 Dakar, sans ouvrir la fiche', async () => {
    monter({ 'filter[due]': 'all' });
    const plusTard = await screen.findByRole('region', { name: 'Plus tard' });
    await userEvent.click(within(plusTard).getByRole('button', { name: 'Reporter « Renouveler le bail de Moussa »' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Demain' }));
    await waitFor(() => expect(ecritures('PATCH')).toHaveLength(1));
    expect(ecritures('PATCH')[0]!.chemin).toBe('/api/tasks/5');
    expect(ecritures('PATCH')[0]!.corps).toEqual({ due_at: '2026-11-11T09:00:00Z' });
    expect(screen.queryByRole('dialog', { name: 'Tâche' })).toBeNull();
  });

  it('« Modifier » ouvre la fiche, le titre en édition', async () => {
    monter({ 'filter[due]': 'all' });
    const plusTard = await screen.findByRole('region', { name: 'Plus tard' });
    fireEvent.click(within(plusTard).getByRole('button', { name: 'Modifier « Renouveler le bail de Moussa »' }));
    const fiche = await screen.findByRole('dialog');
    expect(within(fiche).getByRole('textbox', { name: 'Titre de la tâche' })).toHaveValue('Renouveler le bail de Moussa');
  });
});

describe('TCK-2857 — « Nouvelle tâche » préremplie, « Annuler »', () => {
  it('AC4 — ouverte depuis la fiche de Mariama Fall : « Rattachée à » la nomme, la tâche part rattachée à sa fiche', async () => {
    monter({}, { ouvrirNouvelle: true, rattachement: { type: 'customer', id: 12, label: 'Mariama Fall' } });
    const feuille = await screen.findByRole('dialog');
    expect(within(feuille).getByText('Mariama Fall')).toBeInTheDocument();
    expect(within(feuille).getByText('Client · prérempli depuis sa fiche')).toBeInTheDocument();
    fireEvent.change(within(feuille).getByLabelText('Titre'), { target: { value: 'Relancer Mariama après la visite' } });
    fireEvent.click(within(feuille).getByRole('button', { name: 'Créer la tâche · demain' }));
    await waitFor(() => expect(ecritures('POST')).toHaveLength(1));
    expect(ecritures('POST')[0]!.corps).toMatchObject({ taskable_type: 'App\\Models\\Customer', taskable_id: 12 });
  });

  it('un bien du même id, choisi après « Changer », n’est pas dit « prérempli »', async () => {
    monter({}, { ouvrirNouvelle: true, rattachement: { type: 'customer', id: 8, label: 'Mariama Fall' } });
    const feuille = await screen.findByRole('dialog');
    fireEvent.click(within(feuille).getByRole('button', { name: 'Changer' }));
    fireEvent.click(within(feuille).getByRole('radio', { name: 'Un bien' }));
    fireEvent.change(within(feuille).getByRole('searchbox', { name: /Chercher un bien/ }), { target: { value: 'F2' } });
    fireEvent.click(await within(feuille).findByRole('button', { name: 'F2 Grand Yoff' }, { timeout: 2000 }));
    expect(within(feuille).getByText('Bien')).toBeInTheDocument();
    expect(within(feuille).queryByText('Bien · prérempli depuis sa fiche')).toBeNull();
  });

  it('AC5 — au bureau, « Annuler » au pied ferme sans créer', async () => {
    media.bureau = true;
    monter({}, { ouvrirNouvelle: true, rattachement: { type: 'customer', id: 12, label: 'Mariama Fall' } });
    const panneau = await screen.findByRole('dialog');
    fireEvent.change(within(panneau).getByLabelText('Titre'), { target: { value: 'Relancer' } });
    fireEvent.click(within(panneau).getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(ecritures('POST')).toHaveLength(0);
  });
});
