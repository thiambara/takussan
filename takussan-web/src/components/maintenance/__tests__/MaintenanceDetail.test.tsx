import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MaintenanceDetail } from '../MaintenanceDetail';
import type { MaintenanceRequest } from '@/types/maintenance';

const mutation = {
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
  isError: false,
};

const maintenanceQuery = {
  data: undefined as { data: MaintenanceRequest } | undefined,
  isLoading: false,
  isError: false,
  error: null,
};

vi.mock('@/lib/queries/maintenance', async () => {
  const actual = await vi.importActual<typeof import('@/lib/queries/maintenance')>(
    '@/lib/queries/maintenance',
  );
  return {
    ...actual,
    useMaintenanceRequest: () => maintenanceQuery,
    useTransitionMaintenanceStatus: () => mutation,
    useRequestMaintenanceQuote: () => mutation,
    useApproveMaintenanceQuote: () => mutation,
    useStartMaintenance: () => mutation,
    useSubmitMaintenanceQuote: () => mutation,
    useRejectMaintenanceQuote: () => mutation,
  };
});

function wrap(ui: React.ReactElement) {
  return (
    <NextIntlClientProvider
      locale="fr"
      messages={{
        common: {
          status: { loading: 'Chargement', error: 'Erreur' },
          actions: { retry: 'Réessayer', close: 'Fermer' },
        },
        maintenance: {
          priority: {
            low: 'Faible',
            normal: 'Normale',
            high: 'Élevée',
            urgent: 'Urgente',
          },
        },
      }}
    >
      {ui}
    </NextIntlClientProvider>
  );
}

function makeRequest(overrides: Partial<MaintenanceRequest> = {}): MaintenanceRequest {
  return {
    id: 7,
    property_id: 44,
    lease_id: null,
    requester_id: 12,
    assigned_to: 13,
    title: 'Fuite sous évier',
    description: 'Une fuite est visible dans la cuisine.',
    category: 'plumbing',
    priority: 'high',
    status: 'quote_submitted',
    estimated_cost: null,
    actual_cost: null,
    quote_amount: 125000,
    quote_currency: 'XOF',
    quote_submitted_at: '2026-05-06T10:00:00.000Z',
    quote_decision_at: null,
    quote_decision_by_id: null,
    quote_rejection_reason: null,
    scheduled_at: '2026-05-08T09:00:00.000Z',
    started_at: null,
    completed_at: null,
    resolution_notes: null,
    created_at: '2026-05-06T08:00:00.000Z',
    property: {
      id: 44,
      title: 'Villa Ngor',
      slug: 'villa-ngor',
      location: { full: 'Ngor, Dakar, Sénégal' },
    },
    requester: { id: 12, name: 'Mamadou Fall', email: 'mamadou@example.test' },
    assignee: { id: 13, name: 'Awa Diop', email: 'awa@example.test' },
    ...overrides,
  };
}

describe('<MaintenanceDetail>', () => {
  beforeEach(() => {
    maintenanceQuery.isLoading = false;
    maintenanceQuery.isError = false;
    maintenanceQuery.error = null;
    maintenanceQuery.data = { data: makeRequest() };
    mutation.mutate.mockClear();
    mutation.mutateAsync.mockClear();
  });

  it('renders property and people with readable labels instead of raw ids', () => {
    render(wrap(<MaintenanceDetail id={7} />));

    expect(screen.getByRole('heading', { name: 'Fuite sous évier' })).toBeInTheDocument();
    const propertyLink = screen.getByRole('link', { name: /Villa Ngor/i });
    expect(propertyLink).toHaveAttribute('href', '/app/properties/44');
    expect(screen.getByText('Ngor, Dakar, Sénégal')).toBeInTheDocument();
    expect(screen.getByText('Mamadou Fall')).toBeInTheDocument();
    expect(screen.getByText('Awa Diop')).toBeInTheDocument();
    expect(screen.queryByText(/Bien #/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Utilisateur #/i)).not.toBeInTheDocument();
  });

  it('localizes status, priority and quote decision labels', () => {
    render(wrap(<MaintenanceDetail id={7} />));

    expect(screen.getByText('Élevée')).toBeInTheDocument();
    expect(screen.getAllByText('Devis soumis').length).toBeGreaterThan(0);

    const quoteSection = screen.getByRole('heading', { name: 'Devis' }).closest('div');
    expect(quoteSection).not.toBeNull();
    expect(within(quoteSection!).getByText('En attente de décision')).toBeInTheDocument();
    expect(within(quoteSection!).getByText('Montant')).toBeInTheDocument();
    expect(within(quoteSection!).getByText('Soumis le')).toBeInTheDocument();
  });

  it('hides status actions when the request is terminal', () => {
    maintenanceQuery.data = { data: makeRequest({ status: 'closed', priority: 'normal' }) };

    render(wrap(<MaintenanceDetail id={7} />));

    expect(screen.getByText(/état terminal/i)).toHaveTextContent('Clôturée');
    expect(screen.queryByRole('button', { name: 'Devis approuvé' })).not.toBeInTheDocument();
  });
});
