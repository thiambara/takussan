/**
 * TCK-2890 — la liste des clients, maquette `app-clients` e0 : au téléphone, « Relances prévues cette
 * semaine » entre les retards et la semaine, le pied « N clients à relancer · Voir plus » qui charge la
 * page suivante sur place ; au bureau, Étape et Référent se trient.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@/components/ui/toast';
import { withIntl } from '@/test/intl';
import type { PaginatedResponse } from '@/types/api';
import type { CustomerListItem } from '@/types/customer';

const nav = vi.hoisted(() => ({ replace: vi.fn(), params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace, refresh: vi.fn() }),
  useSearchParams: () => nav.params,
  usePathname: () => '/app/customers',
}));
vi.mock('@/lib/queries/customer-gestures', () => ({
  useEnregistrerContactClient: () => ({ mutate: vi.fn(), isError: false }),
  useDesignerReferent: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/components/visits/PlanifierUneVisite', () => ({ PlanifierDialog: () => null }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));
const api = vi.hoisted(() => ({ liste: vi.fn() }));
vi.mock('@/lib/queries/customers', () => ({ fetchDashboardCustomers: api.liste }));

import { ListeDesClients, type ListeDesClientsProps } from '../ListeDesClients';

/** Un client ; `retard` : une relance due ; sinon une tâche à venir (jeudi). */
function client(id: number, prenom: string, retard: boolean): CustomerListItem {
  return {
    id,
    first_name: prenom,
    last_name: 'Ndiaye',
    email: null,
    phone: null,
    status: 'active',
    pipeline_stage: 'prospect',
    created_at: '2026-11-01T10:00:00Z',
    next_action: retard ? null : { type: 'task', id: id, at: '2030-11-14T10:00:00Z', label: `Rappeler ${prenom}`, overdue: false },
    follow_up: retard ? { reason: 'no_contact', since: '2026-11-01T10:00:00Z', days: 9 } : null,
    referent: null,
    tags: [],
  };
}

function page(data: CustomerListItem[], meta: Partial<PaginatedResponse<CustomerListItem>['meta']> = {}): PaginatedResponse<CustomerListItem> {
  return { data, meta: { total: data.length, current_page: 1, last_page: 1, per_page: 20, ...meta } };
}

const RETARDS = [client(1, 'Awa', true), client(2, 'Binta', true)];
const SEMAINE = [client(3, 'Cheikh', false), client(4, 'Dieynaba', false), client(5, 'Elhadji', false), client(6, 'Fatou', false)];

const BASE: ListeDesClientsProps = {
  page: page([...RETARDS, ...SEMAINE]),
  vue: 'a-relancer',
  tri: '-follow_up_days,next_action_at',
  vues: ['a-relancer', 'mes-clients', 'negociation', 'tous'],
  comptes: { 'a-relancer': 6, 'mes-clients': 38, negociation: 10, tous: 141 },
  personnel: true,
  admin: false,
  crmTags: [],
  filtre: true,
};

function monter(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={qc}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>));
}

const lignes = () => screen.getByRole('list', { name: 'Liste des clients' });
const pied = () => document.querySelector('[data-slot="pied-de-la-liste"]') as HTMLElement;

beforeEach(() => {
  nav.replace.mockReset();
  nav.params = new URLSearchParams('vue=a-relancer');
  api.liste.mockReset();
});

describe('au téléphone — « À relancer »', () => {
  it('AC1 — le séparateur est entre les 2 retards et les 4 de la semaine ; le pied dit « 6 clients à relancer »', () => {
    monter(<ListeDesClients {...BASE} />);
    const items = within(lignes()).getAllByRole('listitem');
    const avec = items.map((li) => Boolean(li.querySelector('[data-slot="relances-de-la-semaine"]')));
    expect(avec).toEqual([false, false, true, false, false, false]);
    expect(within(items[2]).getByText('Relances prévues cette semaine')).toBeInTheDocument();
    expect(within(items[2]).getByText('Cheikh Ndiaye')).toBeInTheDocument();
    expect(pied()).toHaveTextContent('6 clients à relancer');
    // Tout est là : pas de « Voir plus ».
    expect(within(pied()).queryByRole('button', { name: 'Voir plus' })).toBeNull();
  });

  it('une recherche dans « À relancer » (pertinence) : aucun séparateur, les groupes y sont mêlés', () => {
    monter(<ListeDesClients {...BASE} tri={undefined} page={page([SEMAINE[0], ...RETARDS])} />);
    expect(document.querySelector('[data-slot="relances-de-la-semaine"]')).toBeNull();
  });

  it('hors « À relancer », aucun séparateur ; le pied dit « N clients »', () => {
    monter(<ListeDesClients {...BASE} vue="tous" />);
    expect(document.querySelector('[data-slot="relances-de-la-semaine"]')).toBeNull();
    expect(pied()).toHaveTextContent('6 clients');
    expect(pied()).not.toHaveTextContent('à relancer');
  });

  it('« Voir plus » charge la page 2 sur place, avec la lecture de l’URL, puis disparaît', async () => {
    api.liste.mockResolvedValue(page([client(7, 'Gora', false), client(6, 'Fatou', false)], { current_page: 2, last_page: 2, total: 8 }));
    monter(<ListeDesClients {...BASE} page={page([...RETARDS, ...SEMAINE], { total: 8, last_page: 2, per_page: 6 })} />);
    expect(pied()).toHaveTextContent('8 clients à relancer · Voir plus');
    fireEvent.click(within(pied()).getByRole('button', { name: 'Voir plus' }));
    expect(api.liste).toHaveBeenCalledWith(
      'jeton',
      expect.objectContaining({ page: 2, sort: '-follow_up_days,next_action_at', filters: expect.objectContaining({ follow_up: 'week' }) }),
    );
    await waitFor(() => expect(within(lignes()).getByText('Gora Ndiaye')).toBeInTheDocument());
    // Fatou, déjà montrée, ne revient pas ; rien n'a navigué.
    expect(within(lignes()).getAllByText('Fatou Ndiaye')).toHaveLength(1);
    expect(nav.replace).not.toHaveBeenCalled();
    expect(within(pied()).queryByRole('button', { name: 'Voir plus' })).toBeNull();
  });
});

describe('au bureau — le tri', () => {
  it('AC2 — « Étape » trie par sort=pipeline_stage, recliquer inverse ; « Référent » trie par nom', () => {
    const { rerender } = monter(<ListeDesClients {...BASE} vue="tous" tri="next_action_at" />);
    const table = screen.getByRole('table', { name: 'Liste des clients' });
    fireEvent.click(within(table).getByRole('button', { name: 'Trier par Étape' }));
    expect(String(nav.replace.mock.calls.at(-1)?.[0])).toContain('sort=pipeline_stage');

    rerender(withIntl(<QueryClientProvider client={new QueryClient()}><ToastProvider><ListeDesClients {...BASE} vue="tous" tri="pipeline_stage" /></ToastProvider></QueryClientProvider>));
    const etape = within(screen.getByRole('table', { name: 'Liste des clients' })).getByRole('columnheader', { name: /Étape/ });
    expect(etape).toHaveAttribute('aria-sort', 'ascending');
    fireEvent.click(within(etape).getByRole('button', { name: 'Trier par Étape' }));
    expect(String(nav.replace.mock.calls.at(-1)?.[0])).toContain('sort=-pipeline_stage');

    fireEvent.click(within(screen.getByRole('table', { name: 'Liste des clients' })).getByRole('button', { name: 'Trier par Référent' }));
    expect(String(nav.replace.mock.calls.at(-1)?.[0])).toContain('sort=referent');
  });
});
