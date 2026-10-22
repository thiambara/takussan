import { describe, expect, it, vi } from 'vitest';

import { useApiMutation } from '@/hooks/useApiQuery';
import { useCreateMaintenanceRequest } from '../maintenance';

/** TCK-1404 (P144.06, ADR-0072 lot 2) — la demande d'intervention part sous une clé d'idempotence (TCK-1396). */
vi.mock('@/hooks/useApiQuery', () => ({ useApiMutation: vi.fn(), useApiQuery: vi.fn() }));

describe('intervention — clé d’idempotence (TCK-1404)', () => {
  it('useCreateMaintenanceRequest demande l’option idempotence', () => {
    useCreateMaintenanceRequest();

    expect(vi.mocked(useApiMutation)).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/maintenance-requests', method: 'POST' }),
      expect.objectContaining({ idempotence: true }),
    );
  });
});
