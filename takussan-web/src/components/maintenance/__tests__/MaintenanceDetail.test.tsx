import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import { MaintenanceDetail } from '../MaintenanceDetail';
import type { MaintenanceAbilities, MaintenanceRequest } from '@/types/maintenance';

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
    useRequestMaintenanceQuote: () => mutation,
    useApproveMaintenanceQuote: () => mutation,
    useStartMaintenance: () => mutation,
    useSubmitMaintenanceQuote: () => mutation,
    useRejectMaintenanceQuote: () => mutation,
    useAcceptMaintenance: () => mutation,
    useDeclineMaintenance: () => mutation,
    useConfirmMaintenanceResolution: () => mutation,
    useContestMaintenanceResolution: () => mutation,
    useUploadMaintenancePhotos: () => mutation,
    useCompleteMaintenanceRequest: () => mutation,
    useTransitionMaintenanceStatus: () => transitionMutation,
    useUpdateMaintenanceRequest: () => updateMutation,
    useAssignableProviders: () => ({ data: { data: [] }, isError: false }),
  };
});

// TCK-592 — la mutation générique (`PUT …/status`) et l'assignation (`PATCH`) sont isolées : les
// critères portent précisément sur ce qu'elles reçoivent, et sur ce qu'elles ne reçoivent JAMAIS.
const transitionMutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false };
const updateMutation = {
  mutate: vi.fn(),
  mutateAsync: vi.fn().mockResolvedValue({}),
  isPending: false,
  isError: false,
  error: null,
};

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 99, agency_id: 3, roles: ['agent'] }, token: 't' }),
}));

// L'invitation monte un client de requêtes : hors sujet ici, son lien profond est testé à part.
vi.mock('@/components/service-providers/InviteServiceProviderSheet', () => ({
  InviteServiceProviderSheet: () => null,
}));

const NO_ABILITIES: MaintenanceAbilities = {
  can_manage_quotes: false,
  can_request_quote: false,
  can_decide_quote: false,
  can_view_quote_pdf: false,
  can_submit_quote: false,
  can_accept: false,
  can_decline: false,
  can_assign: false,
  can_complete: false,
  can_upload_before_photos: false,
  can_confirm_resolution: false,
  can_contest_resolution: false,
  transitions: [],
};

/**
 * ⚠ TCK-292 (lot I) — ce test montait un jeu de messages STUB de six clés. Tout l'écran étant
 * passé au dictionnaire, un stub rendrait désormais des CLÉS et non des libellés : le harnais
 * `withIntl` charge le VRAI `fr.json`, donc les assertions françaises ci-dessous portent sur ce
 * que l'utilisateur lit. Aucune d'elles n'a été modifiée.
 */
function wrap(ui: React.ReactElement) {
  return withIntl(ui);
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
    // Le donneur d'ordre par défaut : les tests antérieurs à TCK-592 lisaient la fiche comme lui.
    abilities: { ...NO_ABILITIES, can_manage_quotes: true, can_decide_quote: true, transitions: ['cancelled'] },
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
    transitionMutation.mutate.mockClear();
    transitionMutation.mutateAsync.mockClear();
    updateMutation.mutateAsync.mockClear();
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

  describe('TCK-592 — AC19 : chaque action naît des abilities', () => {
    it("prestataire, devis soumis : ni « Approuver » ni « Annuler »", () => {
      maintenanceQuery.data = {
        data: makeRequest({ status: 'quote_submitted', abilities: { ...NO_ABILITIES, can_view_quote_pdf: true } }),
      };

      render(wrap(<MaintenanceDetail id={7} />));

      expect(screen.queryByRole('button', { name: /approuver/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Annulée' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /refuser le devis/i })).not.toBeInTheDocument();
    });

    it('prestataire, devis refusé : le formulaire est là, et aucun bouton ne part en PUT …/status', () => {
      maintenanceQuery.data = {
        data: makeRequest({ status: 'rejected', abilities: { ...NO_ABILITIES, can_submit_quote: true } }),
      };

      render(wrap(<MaintenanceDetail id={7} />));

      expect(screen.getByRole('heading', { name: 'Soumettre un nouveau devis' })).toBeInTheDocument();
      for (const button of screen.getAllByRole('button')) {
        fireEvent.click(button);
      }
      expect(transitionMutation.mutate).not.toHaveBeenCalled();
      expect(transitionMutation.mutateAsync).not.toHaveBeenCalled();
    });

    it("agence : pas de formulaire de devis, et un bloc d'assignation qui PATCH assigned_to et scheduled_at", async () => {
      maintenanceQuery.data = {
        data: makeRequest({
          status: 'open',
          abilities: { ...NO_ABILITIES, can_manage_quotes: true, can_assign: true, transitions: ['acknowledged', 'cancelled'] },
        }),
      };

      render(wrap(<MaintenanceDetail id={7} />));

      expect(screen.queryByRole('heading', { name: /soumettre un/i })).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Prestataire et créneau' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

      expect(updateMutation.mutateAsync).toHaveBeenCalledTimes(1);
      const payload = updateMutation.mutateAsync.mock.calls[0][0];
      expect(payload.assigned_to).toBe(13);
      expect(new Date(payload.scheduled_at).toISOString()).toBe('2026-05-08T09:00:00.000Z');
    });

    it('prestataire : aucun lien vers la fiche du bien', () => {
      maintenanceQuery.data = {
        data: makeRequest({ status: 'in_progress', abilities: { ...NO_ABILITIES, can_complete: true } }),
      };

      const { container } = render(wrap(<MaintenanceDetail id={7} />));

      expect(screen.getByText('Villa Ngor')).toBeInTheDocument();
      expect(container.querySelector('a[href^="/app/properties/"]')).toBeNull();
    });

    it('locataire, travaux rendus : « C\'est réparé » et « Le problème persiste », sans transition générique', () => {
      maintenanceQuery.data = {
        data: makeRequest({
          status: 'completed',
          abilities: { ...NO_ABILITIES, can_confirm_resolution: true, can_contest_resolution: true },
        }),
      };

      render(wrap(<MaintenanceDetail id={7} />));

      fireEvent.click(screen.getByRole('button', { name: "C'est réparé" }));
      expect(mutation.mutate).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Le problème persiste' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Changer le statut' })).not.toBeInTheDocument();
    });
  });
});
