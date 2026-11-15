import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
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
  apiRequest: vi.fn(async () => ({ data: [], meta: { total: 0, current_page: 1, last_page: 1, per_page: 100 } })),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, agency_id: 7, roles: ['agency_admin'] }, token: 'jeton', isLoading: false }),
}));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

function monte() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}><AuditTrail /></QueryClientProvider>));
}

/**
 * TCK-2768 (q2 de la vérification de 7981e617d) — l'API refuse (422) un jour qui n'est pas `AAAA-MM-JJ` réel
 * de 1970 au plafond. Le journal lisait `from`/`to` par la seule FORME : un favori « 2026-02-30 » ou
 * « 0001-01-01 » partait à l'API et l'écran perdait sa liste. La borne refusée est ignorée : la vue reprend
 * son défaut, comme la recherche publique écarte un `available_from` refusé.
 */
describe('AuditTrail — une borne d’URL que l’API refuserait est ignorée (TCK-2768)', () => {
  beforeEach(() => {
    navigationDeTest.reinitialiser();
    mockFetchLogs.mockReset();
    mockFetchLogs.mockResolvedValue({ data: [], meta: { total: 0, current_page: 1, last_page: 1, per_page: 50 } });
  });

  it('« 2026-02-30 » et « 0001-01-01 » ne partent pas ; un jour admis part tel quel', async () => {
    navigationDeTest.reinitialiser('from=2026-02-30&to=0001-01-01');
    const { unmount } = monte();

    await waitFor(() => expect(mockFetchLogs).toHaveBeenCalled());
    const refuses = mockFetchLogs.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(refuses.date_from).not.toBe('2026-02-30');
    expect(refuses.date_to).not.toBe('0001-01-01');
    expect(refuses.date_from).toMatch(/^(19[7-9]\d|2\d{3})-\d{2}-\d{2}$/);
    unmount();

    mockFetchLogs.mockClear();
    navigationDeTest.reinitialiser('from=2026-09-01&to=2026-09-30');
    monte();
    await waitFor(() => expect(mockFetchLogs).toHaveBeenCalled());
    expect(mockFetchLogs.mock.calls.at(-1)?.[1]).toMatchObject({ date_from: '2026-09-01', date_to: '2026-09-30' });
  });
});
