/**
 * TCK-2928 — `/app/customers?referent={id}` (« Clients et visites » de la fiche d'un membre) : la liste,
 * filtrée côté serveur, le dit par une puce qui nomme le référent (lu sur les lignes) et le retire.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
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

beforeEach(() => {
  nav.replace.mockReset();
  nav.params = new URLSearchParams('referent=3');
});

describe('la puce du référent', () => {
  it('nomme le référent et retire le filtre de l’URL', () => {
    const avec = { ...client(1, 'Awa', true), referent: { id: 3, name: 'Moussa Ba' } };
    monter(<ListeDesClients {...BASE} vue="tous" page={page([avec])} referentFiltre="3" />);
    const puce = screen.getByRole('button', { name: /Référent :.*Moussa Ba/ });
    fireEvent.click(puce);
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(String(nav.replace.mock.calls[0][0])).not.toContain('referent=');
  });

  it('sans le filtre, pas de puce', () => {
    monter(<ListeDesClients {...BASE} vue="tous" />);
    expect(screen.queryByRole('button', { name: /Référent :/ })).toBeNull();
  });
});
