import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { withIntl } from '@/test/intl';
import { VisitsList } from '../VisitsList';
import type { PropertyVisit } from '@/types/visit';

// ─── Mocks ───────────────────────────────────────────────────────────────────
type QueryResult = { data?: { data: PropertyVisit[] }; isLoading: boolean; isError: boolean };

const upcomingResult: QueryResult = {
  data: undefined,
  isLoading: false,
  isError: false,
};
const pastResult: QueryResult = {
  data: undefined,
  isLoading: false,
  isError: false,
};

vi.mock('@/lib/queries/visits', () => ({
  useVisits: (params: { scheduled_at_min?: string; scheduled_at_max?: string }) => {
    if (params.scheduled_at_min) return upcomingResult;
    return pastResult;
  },
}));

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // `withIntl` charge le VRAI `fr.json` : depuis TCK-291, l'état vide passe par next-intl et
  // `messages={{}}` rendrait la CLÉ au lieu du libellé.
  return withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function mockVisit(overrides: Partial<PropertyVisit> = {}): PropertyVisit {
  return {
    id: 1,
    property_id: 10,
    type: 'in_person',
    status: 'scheduled',
    scheduled_at: '2026-05-10T10:00:00Z',
    duration_minutes: 30,
    property: { id: 10, title: 'Villa à Almadies', slug: 'villa-almadies' },
    ...overrides,
  };
}

describe('<VisitsList>', () => {
  beforeEach(() => {
    upcomingResult.data = { data: [mockVisit({ id: 1, status: 'confirmed' })] };
    upcomingResult.isLoading = false;
    upcomingResult.isError = false;
    pastResult.data = {
      data: [mockVisit({ id: 2, status: 'completed', scheduled_at: '2026-04-01T10:00:00Z' })],
    };
    pastResult.isLoading = false;
    pastResult.isError = false;
  });

  it('renders requested visits by default under the "Demandées" tab', () => {
    render(wrap(<VisitsList />));

    expect(screen.getByRole('tab', { name: /demandées/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /confirmées/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /passées/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /annulées/i })).toBeInTheDocument();
    expect(screen.getByText('Villa à Almadies')).toBeInTheDocument();
    expect(screen.getAllByText(/confirmée/i).length).toBeGreaterThan(0);
  });

  it('switches to the past tab when clicked', async () => {
    const user = userEvent.setup();
    render(wrap(<VisitsList />));

    await user.click(screen.getByRole('tab', { name: /passées/i }));

    expect(screen.getAllByText(/terminée/i)[0]).toBeInTheDocument();
  });

  it('renders an empty state when the tab has no visits', () => {
    upcomingResult.data = { data: [] };
    render(wrap(<VisitsList />));
    expect(screen.getByText(/aucune visite demandée/i)).toBeInTheDocument();
  });

  it('renders a skeleton while loading', () => {
    upcomingResult.data = undefined;
    upcomingResult.isLoading = true;
    const { container } = render(wrap(<VisitsList />));
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });
});
