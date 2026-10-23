import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { navigationDeTest } from '@/test/navigation-url';
import { AuditTrail } from '../AuditTrail';

vi.mock('next/navigation', async () => (await import('@/test/navigation-url')).moduleNavigation);

const mockFetchLogs = vi.fn();
vi.mock('@/lib/queries/audit-logs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/audit-logs')>()),
  fetchAuditLogs: (...args: unknown[]) => mockFetchLogs(...args),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: vi.fn(async () => ({
    data: [{ id: 42, first_name: 'Moussa', last_name: 'Ndiaye', email: 'm@example.test' }],
    meta: { total: 1, current_page: 1, last_page: 1, per_page: 100 },
  })),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, agency_id: 7, roles: ['agency_admin'] }, token: 'jeton', isLoading: false }),
}));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

function monte() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}><AuditTrail /></QueryClientProvider>));
}

function derniersFiltres() {
  return mockFetchLogs.mock.calls.at(-1)?.[1] as Record<string, unknown>;
}

/**
 * TCK-1738 (P168.03) — dates, événement, objet, membre, recherche et page du journal d'audit vivent
 * dans l'URL. Tenus en `useState`, ils se perdaient au retour de l'objet ouvert d'un clic, au
 * rechargement et au lien copié.
 */
describe('AuditTrail — la vue dans l’URL (TCK-1738)', () => {
  beforeEach(() => {
    navigationDeTest.reinitialiser();
    mockFetchLogs.mockReset();
    mockFetchLogs.mockResolvedValue({ data: [], meta: { total: 120, current_page: 1, last_page: 3, per_page: 50 } });
  });

  it('ouvre la vue que porte l’URL', async () => {
    navigationDeTest.reinitialiser(
      'from=2026-09-01&to=2026-09-30&event=created&subject=App%5CModels%5CProperty&member=42&search=bail&page=2',
    );
    monte();

    await waitFor(() => expect(mockFetchLogs).toHaveBeenCalled());
    expect(derniersFiltres()).toMatchObject({
      date_from: '2026-09-01',
      date_to: '2026-09-30',
      event: 'created',
      subject_type: 'App\\Models\\Property',
      causer_id: 42,
      search: 'bail',
      page: 2,
    });
  });

  it('ignore les valeurs inconnues ou mal formées', async () => {
    navigationDeTest.reinitialiser('from=hier&event=bidon&subject=bidon&member=abc&page=0');
    monte();

    await waitFor(() => expect(mockFetchLogs).toHaveBeenCalled());
    const filtres = derniersFiltres();
    expect(filtres.date_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(filtres).toMatchObject({ event: undefined, subject_type: undefined, causer_id: undefined, page: 1 });
  });

  it('écrit le membre choisi dans l’URL, et revient à la page 1', async () => {
    navigationDeTest.reinitialiser('page=2');
    const user = userEvent.setup();
    monte();

    await user.click(screen.getByRole('combobox', { name: 'Filtrer par membre' }));
    await user.click(await screen.findByRole('option', { name: 'Moussa Ndiaye' }));

    expect(navigationDeTest.replace).toHaveBeenLastCalledWith('?member=42', { scroll: false });
  });
});
