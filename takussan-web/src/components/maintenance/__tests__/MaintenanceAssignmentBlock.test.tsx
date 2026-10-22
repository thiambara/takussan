import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import type { ServiceProviderProfileSummary } from '@/lib/queries/service-providers';
import type { MaintenanceRequest } from '@/types/maintenance';
import { MaintenanceAssignmentBlock } from '../MaintenanceAssignmentBlock';

let carnet: ServiceProviderProfileSummary[] = [];

vi.mock('@/lib/queries/maintenance', () => ({
  useAssignableProviders: () => ({ data: { data: carnet }, isError: false }),
  useUpdateMaintenanceRequest: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false, error: null }),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { agency_id: 7 }, token: 'jeton' }) }));
vi.mock('@/components/service-providers/InviteServiceProviderSheet', () => ({
  InviteServiceProviderSheet: () => null,
}));
vi.mock('@/components/ui/date-time-picker', () => ({
  DateTimePicker: ({ id, value }: { id: string; value: string }) => <input id={id} value={value} readOnly />,
}));

function prestataire(overrides: Partial<ServiceProviderProfileSummary> = {}): ServiceProviderProfileSummary {
  return {
    id: 3, user_id: 103, status: 'active', specialties: ['plumbing'], service_areas: ['Dakar'],
    metadata: null, created_at: null,
    user: { id: 103, first_name: 'Fatou', last_name: 'Sarr', email: 'f@example.test' },
    ...overrides,
  };
}

function demande(scheduledAt: string | null): MaintenanceRequest {
  return {
    id: 1, assigned_to: 103, category: 'plumbing', scheduled_at: scheduledAt,
    property: null, assignee: { id: 103, name: 'Fatou Sarr', email: 'f@example.test' },
  } as unknown as MaintenanceRequest;
}

function monter(p: ServiceProviderProfileSummary, scheduledAt: string | null = null) {
  carnet = [p];
  render(withIntl(<MaintenanceAssignmentBlock request={demande(scheduledAt)} />));
}

describe('<MaintenanceAssignmentBlock> — TCK-1325 (P117.06), badge « Assuré »', () => {
  it('le prestataire retenu et assuré porte le badge', () => {
    monter(prestataire({ insured: true }));
    expect(screen.getByTestId('assignee-insured')).toHaveTextContent('Assuré');
  });

  it('un prestataire sans pièce vivante ne le porte pas', () => {
    monter(prestataire({ insured: false }));
    expect(screen.queryByTestId('assignee-insured')).not.toBeInTheDocument();
  });
});
