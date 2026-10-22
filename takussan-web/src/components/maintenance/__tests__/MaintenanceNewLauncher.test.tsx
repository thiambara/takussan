import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';

/**
 * TCK-1436 (P162.04) — le lanceur d'une demande liste les baux où l'API accepte la demande :
 * `active` ET `terminating` (TCK-1001). Un locataire en préavis tombait sur « contactez l'agence ».
 */
const apiQueryCalls: unknown[][] = [];

vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: (...args: unknown[]) => {
    apiQueryCalls.push(args);
    return {
      data: { data: [{ id: 5, status: 'terminating', property: { id: 44, title: 'Villa Ngor' } }] },
      isLoading: false,
      isError: false,
      error: null,
    };
  },
  useApiMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('../MaintenanceForm', () => ({
  MaintenanceForm: ({ propertyId, leaseId }: { propertyId: number; leaseId: number }) => (
    <div data-testid="form">{`${propertyId}/${leaseId}`}</div>
  ),
}));

import { MaintenanceNewLauncher } from '../MaintenanceNewLauncher';

describe('MaintenanceNewLauncher', () => {
  it('demande les baux actifs et en préavis, et propose le bail en préavis', () => {
    render(withIntl(<MaintenanceNewLauncher />));

    const options = apiQueryCalls.at(-1)?.[2] as { params: { filter: Record<string, string> } };
    expect(options.params.filter.status).toBe('active,terminating');
    expect(screen.getByTestId('form').textContent).toBe('44/5');
  });
});
