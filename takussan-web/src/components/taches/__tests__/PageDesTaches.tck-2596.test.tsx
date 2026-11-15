/**
 * TCK-2596 (lot 2) — la page « Tâches ». Le réseau est doublé au niveau d'`apiRequest` (les hooks de
 * requête et de mutation tournent pour de vrai) : on lit les requêtes émises avec leurs filtres et
 * les corps envoyés.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';

import { ApiError } from '@/lib/api';
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
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: () => false }));
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
      return page([]);
    }),
  };
});

/** Mardi 10 novembre 2026, 10:12 à Dakar. */
const MAINTENANT = new Date('2026-11-10T10:12:00Z');

function monter(params: Record<string, string> = {}, props: { ouvrirNouvelle?: boolean; equipeVisible?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{withIntl(<PageDesTaches etatInitial={lireEtat(params)} {...props} />)}</QueryClientProvider>);
}

const lectures = () =>
  etat.appels.filter((a) => a.methode === 'GET' && a.chemin.startsWith('/api/tasks?')).map((a) => new URLSearchParams(a.chemin.split('?')[1] ?? ''));
const listes = () => lectures().filter((p) => p.get('per_page') === '30');
const puce = (nom: RegExp) => within(screen.getByRole('group', { name: 'Échéance' })).getByRole('button', { name: nom });
const ecritures = (methode: string) => etat.appels.filter((a) => a.methode === methode);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(MAINTENANT);
  Object.assign(etat, { appels: [], taches: [EN_RETARD, DU_JOUR], dernierePage: 1, panne: false, membresRefuses: false });
  replace.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('Tâches — sources et pastilles', () => {
  it('s’ouvre sur En retard + Aujourd’hui, colonnes de l’assigné et du créateur comprises ; chaque pastille comptée', async () => {
    monter();
    await screen.findByText('Relancer Yacine (offre villa)');
    const liste = listes()[0]!;
    expect(liste.get('filter[due]')).toBe('overdue,today');
    expect(liste.get('sort')).toBe('due_at');
    expect(liste.get('fields[tasks]')!.split(',')).toEqual(expect.arrayContaining(['assigned_to_id', 'created_by_id', 'created_at']));

    const comptes = lectures().filter((p) => p.get('per_page') === '1');
    expect(comptes.map((p) => [p.get('filter[due]'), p.get('filter[status]')])).toEqual(
      expect.arrayContaining([
        ['overdue', 'open,in_progress'],
        ['today', 'open,in_progress'],
        ['upcoming', 'open,in_progress'],
        ['none', 'open,in_progress'],
        [null, 'done'],
      ]),
    );
    await waitFor(() => expect(puce(/^En retard\s*2$/)).toHaveAttribute('aria-pressed', 'true'));
    expect(puce(/^Aujourd’hui\s*3$/)).toHaveAttribute('aria-pressed', 'true');
    expect(puce(/^À venir\s*4$/)).toHaveAttribute('aria-pressed', 'false');
    expect(puce(/^Faites\s*12$/)).toBeInTheDocument();
    expect(screen.getByText('2 en retard · 3 aujourd’hui · 4 à venir')).toBeInTheDocument();
  });

  it('groupe par échéance : le bien nommé, le retard sur sa ligne, Appeler et WhatsApp pour un client', async () => {
    monter();
    const retard = await screen.findByRole('region', { name: 'En retard' });
    expect(within(retard).getByText('F2 Grand Yoff')).toBeInTheDocument();
    expect(within(retard).getByText('En retard depuis le 17 oct.')).toBeInTheDocument();
    const jour = screen.getByRole('region', { name: 'Aujourd’hui' });
    expect(within(jour).getByText('Aujourd’hui, 18:00')).toBeInTheDocument();
    expect(within(jour).getByRole('link', { name: 'Appeler Yacine Diouf' })).toHaveAttribute('href', 'tel:+221706190713');
    expect(within(jour).getByRole('link', { name: 'Écrire à Yacine Diouf sur WhatsApp' })).toHaveAttribute('href', expect.stringContaining('wa.me/221706190713'));
  });

  it('une pastille de plus part au serveur, et l’URL garde « assignées à moi »', async () => {
    monter({ 'filter[due]': 'today', 'filter[assigned_to]': 'me' });
    await screen.findByText('Relancer Yacine (offre villa)');
    expect(listes()[0]!.get('filter[assigned_to]')).toBe('me');
    fireEvent.click(puce(/^À venir/));
    await waitFor(() => expect(listes().at(-1)!.get('filter[due]')).toBe('today,upcoming'));
    expect(listes().at(-1)!.get('filter[assigned_to]')).toBe('me');
    expect(replace).toHaveBeenLastCalledWith('/app/tasks?filter[due]=today,upcoming&filter[assigned_to]=me', { scroll: false });
    fireEvent.click(puce(/^Faites/));
    await waitFor(() => expect(listes().at(-1)!.get('filter[status]')).toBe('done'));
    expect(replace).toHaveBeenLastCalledWith('/app/tasks?filter[status]=done&filter[assigned_to]=me', { scroll: false });
  });

  it('« Voir plus » lit la page suivante, par 30', async () => {
    etat.dernierePage = 2;
    monter();
    fireEvent.click(await screen.findByRole('button', { name: 'Voir plus' }));
    await waitFor(() => expect(listes().at(-1)!.get('page')).toBe('2'));
  });

  it('une panne se dit, avec « Réessayer » ; une liste vide se dit par filtre', async () => {
    etat.panne = true;
    const { unmount } = monter();
    fireEvent.click(await screen.findByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(listes()).toHaveLength(2));
    unmount();
    Object.assign(etat, { panne: false, taches: [] });
    monter({ 'filter[due]': 'overdue' });
    expect(await screen.findByText('Aucune tâche en retard.')).toBeInTheDocument();
  });
});

describe('Tâches — gestes', () => {
  it('cocher marque la tâche faite', async () => {
    monter();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Marquer « Relancer Yacine (offre villa) » comme faite' }));
    await waitFor(() => expect(ecritures('PATCH')).toHaveLength(1));
    expect(ecritures('PATCH')[0]).toMatchObject({ chemin: '/api/tasks/3', corps: { status: 'done' } });
  });

  it('la tâche ouverte : « Reporter à · Demain » envoie le lendemain 09:00 Dakar ; « Supprimer » est absent quand un autre l’a créée', async () => {
    monter();
    fireEvent.click(await screen.findByText('Faire signer l’état des lieux d’entrée'));
    const feuille = await screen.findByRole('dialog');
    expect(within(feuille).getByRole('link', { name: 'F2 Grand Yoff' })).toHaveAttribute('href', '/app/properties/8');
    expect(within(feuille).getByText('9 oct., par Serigne Ndoye')).toBeInTheDocument();
    expect(within(feuille).queryByRole('button', { name: 'Supprimer la tâche' })).toBeNull();
    fireEvent.click(within(feuille).getByRole('button', { name: 'Demain' }));
    await waitFor(() => expect(ecritures('PATCH')).toHaveLength(1));
    expect(ecritures('PATCH')[0]).toMatchObject({ chemin: '/api/tasks/1', corps: { due_at: '2026-11-11T09:00:00Z' } });
  });

  it('son créateur la supprime, après confirmation ; l’assigner part à l’API', async () => {
    monter();
    fireEvent.click(await screen.findByText('Relancer Yacine (offre villa)'));
    const feuille = await screen.findByRole('dialog');
    await waitFor(() => expect(etat.appels.some((a) => a.chemin.startsWith('/api/agencies/3/members'))).toBe(true));
    await userEvent.click(await within(feuille).findByRole('combobox', { name: 'Assignée à' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Serigne Ndoye' }));
    await waitFor(() => expect(ecritures('PATCH')).toHaveLength(1));
    expect(ecritures('PATCH')[0]!.corps).toEqual({ assigned_to_id: 6 });

    fireEvent.click(within(feuille).getByRole('button', { name: 'Supprimer la tâche' }));
    expect(ecritures('DELETE')).toHaveLength(0);
    fireEvent.click(within(feuille).getByRole('button', { name: 'Confirmer la suppression' }));
    await waitFor(() => expect(ecritures('DELETE')).toHaveLength(1));
    expect(ecritures('DELETE')[0]!.chemin).toBe('/api/tasks/3');
  });

  it('sans la liste du personnel (403), « Moi » reste seul : aucun choix d’assigné', async () => {
    etat.membresRefuses = true;
    monter();
    fireEvent.click(await screen.findByText('Relancer Yacine (offre villa)'));
    const feuille = await screen.findByRole('dialog');
    await waitFor(() => expect(etat.appels.some((a) => a.chemin.startsWith('/api/agencies/3/members'))).toBe(true));
    expect(within(feuille).queryByRole('combobox')).toBeNull();
    expect(within(feuille).getByText('Moi')).toBeInTheDocument();
  });

  it('« Nouvelle tâche » : active avec un titre et une cible ; part avec l’échéance de demain 09:00 et le client choisi', async () => {
    monter({}, { ouvrirNouvelle: true });
    const feuille = await screen.findByRole('dialog');
    const creer = within(feuille).getByRole('button', { name: 'Créer la tâche · demain' });
    expect(creer).toBeDisabled();
    fireEvent.change(within(feuille).getByLabelText('Titre'), { target: { value: 'Relancer Mariama après la visite' } });
    expect(creer).toBeDisabled();
    fireEvent.change(within(feuille).getByRole('textbox', { name: /Chercher un client/ }), { target: { value: 'Ma' } });
    fireEvent.click(await within(feuille).findByRole('button', { name: 'Mariama Fall' }, { timeout: 2000 }));
    const recherche = etat.appels.find((a) => a.chemin.startsWith('/api/customers?'))!;
    const p = new URLSearchParams(recherche.chemin.split('?')[1]);
    expect([p.get('filter[search]'), p.get('per_page')]).toEqual(['Ma', '8']);
    expect(creer).toBeEnabled();
    fireEvent.click(creer);
    await waitFor(() => expect(ecritures('POST')).toHaveLength(1));
    expect(ecritures('POST')[0]!.corps).toEqual({ title: 'Relancer Mariama après la visite', due_at: '2026-11-11T09:00:00Z', taskable_type: 'App\\Models\\Customer', taskable_id: 4 });
  });

  it('le filtre d’équipe n’est offert qu’au lecteur de l’agence, et part en filter[team]', async () => {
    const { unmount } = monter();
    await screen.findByText('Relancer Yacine (offre villa)');
    expect(screen.queryByRole('combobox', { name: 'Assignée à' })).toBeNull();
    unmount();
    monter({}, { equipeVisible: true });
    await userEvent.click(await screen.findByRole('combobox', { name: 'Assignée à' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Toute l’équipe' }));
    await waitFor(() => expect(listes().at(-1)!.get('filter[team]')).toBe('1'));
    expect(replace).toHaveBeenLastCalledWith('/app/tasks?filter[team]=1', { scroll: false });
  });
});

// Un refus d'écriture se dit sur la page, sans retirer la ligne.
describe('Tâches — refus', () => {
  it('un refus de coche se dit', async () => {
    const { apiRequest } = await import('@/lib/api');
    monter();
    await screen.findByText('Relancer Yacine (offre villa)');
    vi.mocked(apiRequest).mockImplementationOnce(async () => {
      throw new ApiError(403, { message: 'non' });
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Marquer « Relancer Yacine (offre villa) » comme faite' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Relancer Yacine (offre villa)')).toBeInTheDocument();
  });
});
