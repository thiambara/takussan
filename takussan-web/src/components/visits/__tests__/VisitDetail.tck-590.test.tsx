/**
 * TCK-590 — « Prendre en charge » (personnel, visite sans agent ; 409 = un collègue l'a prise) et
 * « Proposer un autre créneau » (visiteur, créneaux tirés de l'API, heure construite à Dakar).
 */
process.env.TZ = 'Europe/Paris';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import { VisitDetail } from '../VisitDetail';
import type { PropertyVisit } from '@/types/visit';

const etat = vi.hoisted(() => ({
  visit: null as PropertyVisit | null,
  user: { id: 7, roles: ['agent'] as string[] },
}));
const mutation = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const claim = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const propose = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const toastAdd = vi.fn();
const apiFetch = vi.fn();

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: etat.user }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: toastAdd }) }));
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));
vi.mock('@/lib/queries/visits', () => ({
  useVisit: () => ({ data: { data: etat.visit }, isLoading: false, isError: false }),
  useCancelVisit: () => mutation,
  useCompleteVisit: () => mutation,
  useConfirmVisit: () => mutation,
  useUpdateVisit: () => mutation,
  useClaimVisit: () => claim,
  useProposeVisitSlot: () => propose,
}));

function visite(overrides: Partial<PropertyVisit> = {}): PropertyVisit {
  return {
    id: 1,
    property_id: 10,
    visitor_id: null,
    customer_id: null,
    agent_id: null,
    type: 'in_person',
    status: 'scheduled',
    scheduled_at: '2026-11-10T10:00:00Z',
    duration_minutes: 30,
    visitor_name: 'Awa Diop',
    visitor_phone: '+221771234567',
    property: { id: 10, title: 'Villa à Almadies', slug: 'villa-almadies' },
    ...overrides,
  };
}

describe('<VisitDetail> — TCK-590', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    etat.user = { id: 7, roles: ['agent'] };
    etat.visit = visite();
    claim.mutateAsync.mockResolvedValue({});
    apiFetch.mockImplementation((path: string) => {
      const jour = /date=(\d{4}-\d{2}-\d{2})/.exec(path)?.[1] ?? '';
      return Promise.resolve({
        data: {
          slots: ['09:30', '10:00', '10:30'].map((label) => ({
            start: `${jour}T${label}:00Z`,
            label,
            available: label !== '10:30',
          })),
        },
      });
    });
  });

  it('l’agent prend en charge une visite sans agent', async () => {
    const user = userEvent.setup();
    render(withIntl(<VisitDetail id={1} />));

    await user.click(screen.getByRole('button', { name: 'Prendre en charge' }));
    expect(claim.mutateAsync).toHaveBeenCalled();
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: 'Visite prise en charge.' }));
  });

  it('409 : un collègue l’a prise entre-temps, et on le dit', async () => {
    const { ApiError } = await import('@/lib/api');
    claim.mutateAsync.mockRejectedValueOnce(new ApiError(409, { message: 'déjà' }));
    const user = userEvent.setup();
    render(withIntl(<VisitDetail id={1} />));

    await user.click(screen.getByRole('button', { name: 'Prendre en charge' }));
    await waitFor(() =>
      expect(toastAdd).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Un collègue l’a déjà prise en charge.', type: 'error' }),
      ),
    );
  });

  it('pas de « Prendre en charge » sur une visite déjà attribuée, ni pour un bailleur', () => {
    etat.visit = visite({ agent_id: 9 });
    const { unmount } = render(withIntl(<VisitDetail id={1} />));
    expect(screen.queryByRole('button', { name: 'Prendre en charge' })).not.toBeInTheDocument();
    unmount();

    etat.visit = visite();
    etat.user = { id: 7, roles: ['owner'] };
    render(withIntl(<VisitDetail id={1} />));
    expect(screen.queryByRole('button', { name: 'Prendre en charge' })).not.toBeInTheDocument();
  });

  it('le visiteur propose un autre créneau : grille de l’API, 10:00 à Dakar depuis Paris', async () => {
    etat.user = { id: 30, roles: ['customer'] };
    etat.visit = visite({ visitor_id: 30, agent_id: 7, status: 'confirmed' });
    const user = userEvent.setup();
    render(withIntl(<VisitDetail id={1} />));

    expect(screen.queryByRole('button', { name: 'Prendre en charge' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Proposer un autre créneau' }));
    fireEvent.change(await screen.findByLabelText('Date'), { target: { value: '2026-11-12' } });

    expect(await screen.findByRole('button', { name: '10:30' })).toBeDisabled();
    expect(apiFetch).toHaveBeenCalledWith('/public/properties/villa-almadies/visit-slots?date=2026-11-12');
    await user.click(screen.getByRole('button', { name: '10:00' }));
    await user.click(screen.getByRole('button', { name: 'Proposer' }));

    await waitFor(() => expect(propose.mutateAsync).toHaveBeenCalledWith({ scheduled_at: '2026-11-12T10:00:00Z' }));
  });

  it('le personnel ne « propose » pas : il replanifie', () => {
    render(withIntl(<VisitDetail id={1} />));
    expect(screen.queryByRole('button', { name: 'Proposer un autre créneau' })).not.toBeInTheDocument();
  });
  it('passe 3 (R1) — un SMS retenu par une borne est dit à l’agent, un SMS parti ne l’est pas', async () => {
    const user = userEvent.setup();
    mutation.mutateAsync.mockResolvedValueOnce({
      data: visite({ status: 'confirmed' }),
      sms_sent: false,
      sms_code: 'visit_sms_capped',
      sms_message: 'Le SMS au visiteur n’est pas parti…',
    });
    const { unmount } = render(withIntl(<VisitDetail id={1} />));
    await user.click(screen.getByRole('button', { name: 'Confirmer la visite' }));
    await waitFor(() =>
      expect(toastAdd).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Le SMS au visiteur n’est pas parti.', type: 'warning' }),
      ),
    );
    unmount();

    // SMS parti, puis aucun SMS prévu (visiteur sans numéro : pas de `sms_sent`) : rien à dire.
    for (const reponse of [{ sms_sent: true }, {}]) {
      toastAdd.mockClear();
      mutation.mutateAsync.mockResolvedValueOnce({ data: visite({ status: 'confirmed' }), ...reponse });
      const rendu = render(withIntl(<VisitDetail id={1} />));
      await user.click(screen.getByRole('button', { name: 'Confirmer la visite' }));
      await waitFor(() => expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' })));
      expect(toastAdd).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'warning' }));
      rendu.unmount();
    }
  });
});

