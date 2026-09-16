import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { withIntl } from '@/test/intl';

import { VisitDetail } from '../VisitDetail';
import type { PropertyVisit } from '@/types/visit';
import { ApiError } from '@/lib/api';

const visitState = vi.hoisted(() => ({
  visit: null as PropertyVisit | null,
  error: null as unknown,
}));

const mutation = {
  mutateAsync: vi.fn(),
  isPending: false,
};
const cancelMutation = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const updateMutation = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const push = vi.fn();

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 7, roles: ['agent'] },
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ add: vi.fn() }),
}));

vi.mock('@/lib/queries/visits', () => ({
  useVisit: () => ({
    data: visitState.visit ? { data: visitState.visit } : undefined,
    isLoading: false,
    isError: !visitState.visit,
    error: visitState.error,
    refetch: vi.fn(),
  }),
  useCancelVisit: () => cancelMutation,
  useCompleteVisit: () => mutation,
  useConfirmVisit: () => mutation,
  useUpdateVisit: () => updateMutation,
}));

function renderDetail() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  // TCK-292 : `messages={{}}` rendrait la CLÉ et non le libellé — `withIntl` charge le VRAI
  // `fr.json`, ce qui laisse les assertions françaises de ce fichier inchangées.
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <VisitDetail id={1} />
      </QueryClientProvider>,
    ),
  );
}

function makeVisit(overrides: Partial<PropertyVisit> = {}): PropertyVisit {
  return {
    id: 1,
    property_id: 10,
    visitor_id: null,
    customer_id: null,
    agent_id: 7,
    type: 'in_person',
    status: 'scheduled',
    scheduled_at: '2026-05-10T10:00:00Z',
    duration_minutes: 30,
    property: { id: 10, title: 'Villa à Almadies', slug: 'villa-almadies' },
    ...overrides,
  };
}

describe('<VisitDetail>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    visitState.visit = makeVisit();
    visitState.error = null;
  });

  it('dit « autre agence » sur un 403, sans proposer de réessayer', () => {
    visitState.visit = null;
    visitState.error = new ApiError(403, {});
    renderDetail();

    expect(screen.getByText(/relève d'une autre agence/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /réessayer/i })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('propose de réessayer sur une panne', () => {
    visitState.visit = null;
    visitState.error = new ApiError(500, {});
    renderDetail();

    expect(screen.getByText(/impossible de charger cette visite/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /réessayer/i })).toBeInTheDocument();
  });

  it('shows a CRM customer name, contact details, and customer detail link', () => {
    visitState.visit = makeVisit({
      customer_id: 45,
      customer: {
        id: 45,
        user_id: null,
        first_name: 'Awa',
        last_name: 'Diop',
        email: 'awa.diop@example.test',
        phone: '+221770000000',
      },
    });

    renderDetail();

    expect(screen.getByText('Awa Diop')).toBeInTheDocument();
    expect(screen.getByText('+221770000000')).toBeInTheDocument();
    expect(screen.getByText('awa.diop@example.test')).toBeInTheDocument();
    expect(screen.queryByText(/Customer #45/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /fiche crm/i })).toHaveAttribute(
      'href',
      '/app/customers/45',
    );
  });

  it('shows a registered visitor name and email without a CRM link', () => {
    visitState.visit = makeVisit({
      visitor_id: 9,
      visitor: {
        id: 9,
        first_name: 'Moussa',
        last_name: 'Ndiaye',
        email: 'moussa@example.test',
        phone: null,
      },
    });

    renderDetail();

    expect(screen.getByText('Moussa Ndiaye')).toBeInTheDocument();
    expect(screen.getByText('moussa@example.test')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /fiche crm/i })).not.toBeInTheDocument();
  });

  it('shows anonymous visitor fallback with available contact details', () => {
    visitState.visit = makeVisit({
      visitor_name: null,
      visitor_phone: '+221781111111',
      visitor_email: 'visiteur@example.test',
    });

    renderDetail();

    expect(screen.getByText('Visiteur anonyme')).toBeInTheDocument();
    expect(screen.getByText('+221781111111')).toBeInTheDocument();
    expect(screen.getByText('visiteur@example.test')).toBeInTheDocument();
  });

  it('keeps visit actions visible for a scheduled manageable visit', () => {
    renderDetail();

    expect(screen.getByRole('button', { name: /confirmer la visite/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /replanifier/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /annuler/i })).toBeInTheDocument();
  });
  it("annule par un dialogue : motif exigé, puis le même payload qu'avant", async () => {
    const user = userEvent.setup();
    const prompt = vi.spyOn(window, 'prompt');
    renderDetail();

    await user.click(screen.getByRole('button', { name: /^annuler$/i }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/annuler la visite/i);

    await user.click(screen.getByRole('button', { name: /annuler la visite/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/indiquez le motif/i);
    expect(cancelMutation.mutateAsync).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/motif d.annulation/i), '  Visiteur indisponible  ');
    await user.click(screen.getByRole('button', { name: /annuler la visite/i }));

    expect(cancelMutation.mutateAsync).toHaveBeenCalledWith({ reason: 'Visiteur indisponible' });
    expect(push).toHaveBeenCalledWith('/app/visits');
    expect(prompt).not.toHaveBeenCalled();
  });

  it('replanifie par un champ date/heure : même conversion ISO que le prompt', async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole('button', { name: /replanifier/i }));
    await screen.findByRole('dialog');
    const field = screen.getByLabelText(/nouveau créneau/i);
    expect(field).toHaveAttribute('type', 'datetime-local');
    // Le créneau courant est proposé, comme le faisait le prompt.
    expect(field).toHaveValue('2026-05-10T10:00');

    await user.clear(field);
    await user.click(screen.getByRole('button', { name: /enregistrer le créneau/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/choisissez une date/i);
    expect(updateMutation.mutateAsync).not.toHaveBeenCalled();

    await user.type(field, '2026-06-01T14:30');
    await user.click(screen.getByRole('button', { name: /enregistrer le créneau/i }));

    expect(updateMutation.mutateAsync).toHaveBeenCalledWith({
      scheduled_at: new Date('2026-06-01T14:30').toISOString(),
    });
  });
});
