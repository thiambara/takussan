import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, renderHook, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import type { MaintenanceListParams } from '@/lib/queries/maintenance';
import type { MaintenanceRequest } from '@/types/maintenance';

const auth = { user: { id: 13, roles: ['service_provider'] } as { id: number; roles: string[] } | null };
const listParams: (MaintenanceListParams | undefined)[] = [];
const apiQueryCalls: unknown[][] = [];
let canCreate = false;
let pageRows: MaintenanceRequest[] | null = null;
let lastPage = 1;

vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));

vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: (...args: unknown[]) => {
    apiQueryCalls.push(args);
    return { data: undefined, isLoading: true, isError: false, error: null };
  },
  useApiMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

const row: MaintenanceRequest = {
  id: 7,
  property_id: 44,
  lease_id: null,
  requester_id: 12,
  assigned_to: 13,
  title: 'Fuite sous évier',
  description: '',
  category: 'plumbing',
  priority: 'normal',
  status: 'assigned',
  estimated_cost: null,
  actual_cost: null,
  quote_amount: null,
  quote_currency: null,
  quote_submitted_at: null,
  quote_decision_at: null,
  quote_decision_by_id: null,
  quote_rejection_reason: null,
  scheduled_at: '2026-10-08T09:00:00.000Z',
  started_at: null,
  completed_at: null,
  resolution_notes: null,
  created_at: '2026-10-01T08:00:00.000Z',
  property: {
    id: 44,
    title: 'Villa Ngor',
    slug: 'villa-ngor',
    location: { quarter: 'Médina' },
    agency: { id: 3, name: 'Teranga Immo' },
  },
};

vi.mock('@/lib/queries/maintenance', async () => {
  const actual = await vi.importActual<typeof import('@/lib/queries/maintenance')>('@/lib/queries/maintenance');
  return {
    ...actual,
    useMaintenanceRequests: (params?: MaintenanceListParams) => {
      listParams.push(params);
      return {
        data: {
          data: pageRows ?? [row],
          meta: {
            current_page: 1,
            last_page: lastPage,
            per_page: 20,
            total: (pageRows ?? [row]).length * lastPage,
            abilities: { can_create: canCreate },
          },
        },
        isLoading: false,
        isError: false,
        error: null,
      };
    },
  };
});

/** TCK-592 (P14, P17, AC21) — « Mes interventions » du prestataire. */
describe('<MaintenanceList> — prestataire', () => {
  beforeEach(() => {
    listParams.length = 0;
    apiQueryCalls.length = 0;
    auth.user = { id: 13, roles: ['service_provider'] };
    canCreate = false;
    pageRows = null;
    lastPage = 1;
  });

  /**
   * P199.04 (TCK-2167) — triée par créneau, la liste du prestataire sépare les urgences de la
   * seule page reçue : une urgence planifiée tard est en page 2, et la page 1 n'a pas de section.
   * La section ne se rend donc que quand la liste tient sur une page.
   */
  it('rend « Urgences prioritaires » quand la liste tient sur une page', async () => {
    pageRows = [row, { ...row, id: 8, title: 'Coupure de courant', priority: 'urgent' }];
    const { MaintenanceList } = await import('../MaintenanceList');
    render(withIntl(<MaintenanceList />));

    expect(screen.getByRole('heading', { name: 'Urgences prioritaires' })).toBeInTheDocument();
  });

  it('ne rend pas la section quand la liste a plusieurs pages : l’urgence reste à sa place, avec son badge', async () => {
    pageRows = [row, { ...row, id: 8, title: 'Coupure de courant', priority: 'urgent' }];
    lastPage = 2;
    const { MaintenanceList } = await import('../MaintenanceList');
    render(withIntl(<MaintenanceList />));

    expect(screen.queryByRole('heading', { name: 'Urgences prioritaires' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Autres demandes' })).not.toBeInTheDocument();
    const titres = screen.getAllByRole('link').map((a) => a.textContent ?? '');
    const urgence = titres.findIndex((texte) => texte.includes('Coupure de courant'));
    expect(urgence).toBeGreaterThan(titres.findIndex((texte) => texte.includes('Fuite sous évier')));
    expect(titres[urgence]).toContain('Urgente');
  });

  it('part triée par créneau, nomme le quartier et l\'agence, et ne propose pas « Nouvelle demande »', async () => {
    const { MaintenanceList } = await import('../MaintenanceList');
    render(withIntl(<MaintenanceList />));

    expect(listParams.at(-1)?.sort).toBe('scheduled_at');
    expect(screen.getByText(/Médina/)).toBeInTheDocument();
    expect(screen.getByText(/Agence Teranga Immo/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nouvelle demande' })).not.toBeInTheDocument();
  });

  it('propose « Nouvelle demande » quand l\'API dit qu\'elle mène quelque part', async () => {
    auth.user = { id: 12, roles: ['tenant'] };
    canCreate = true;
    const { MaintenanceList } = await import('../MaintenanceList');
    render(withIntl(<MaintenanceList />));

    expect(listParams.at(-1)?.sort).toBeUndefined();
    expect(screen.getByRole('link', { name: 'Nouvelle demande' })).toHaveAttribute('href', '/app/maintenance/new');
  });

  it('la requête inclut le bien et l\'agence (`include=property`, `agency_id` demandé)', async () => {
    const { useMaintenanceRequests } = await vi.importActual<typeof import('@/lib/queries/maintenance')>(
      '@/lib/queries/maintenance',
    );
    renderHook(() => useMaintenanceRequests({ sort: 'scheduled_at' }));

    const options = apiQueryCalls.at(-1)?.[2] as {
      params: { sort: string; include: string[]; fields: Record<string, string[]> };
    };
    expect(options.params.sort).toBe('scheduled_at');
    expect(options.params.include).toContain('property');
    expect(options.params.fields.properties).toContain('agency_id');
  });
});
