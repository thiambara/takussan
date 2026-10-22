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

describe('<MaintenanceAssignmentBlock> — TCK-1327 (P117.07), la plage horaire', () => {
  const lundiMatin = { availability: [{ day: 'monday', from: '08:00', to: '12:00' }] } as never;
  const avertissement = /ne déclare pas travailler ce jour-là/;

  // 2026-10-19 est un lundi ; les heures sont locales (`toLocalValue`), d'où un ISO sans fuseau.
  it('lundi 18 h chez un prestataire disponible le lundi de 08:00 à 12:00 → avertissement', () => {
    monter(prestataire({ metadata: lundiMatin }), '2026-10-19T18:00:00');
    expect(screen.getByText(avertissement)).toBeInTheDocument();
  });

  it('lundi 10 h, dans la plage → aucun avertissement', () => {
    monter(prestataire({ metadata: lundiMatin }), '2026-10-19T10:00:00');
    expect(screen.queryByText(avertissement)).not.toBeInTheDocument();
  });

  it('un créneau sans heures garde la comparaison du seul jour', () => {
    monter(prestataire({ metadata: { availability: [{ day: 'monday' }] } as never }), '2026-10-19T18:00:00');
    expect(screen.queryByText(avertissement)).not.toBeInTheDocument();
  });
});

describe('<MaintenanceAssignmentBlock> — le jour, contrôle', () => {
  it('mardi chez un prestataire du seul lundi → avertissement (le motif cherché est bien le texte rendu)', () => {
    monter(prestataire({ metadata: { availability: [{ day: 'monday', from: '08:00', to: '12:00' }] } as never }), '2026-10-20T10:00:00');
    expect(screen.getByText(/ne déclare pas travailler ce jour-là/)).toBeInTheDocument();
  });
});
