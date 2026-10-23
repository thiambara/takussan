/**
 * P182.01 — une erreur de l'API sur un geste de la visite (confirmer, terminer, absent, annuler,
 * replanifier) s'affiche. Avant, la promesse rejetée n'était rattrapée par rien : le clic ne
 * produisait aucun message, et le dialogue d'annulation restait ouvert sans rien dire.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import { ApiError } from '@/lib/api';
import { VisitDetail } from '../VisitDetail';
import type { PropertyVisit } from '@/types/visit';

const etat = vi.hoisted(() => ({ visit: null as PropertyVisit | null }));
const neutre = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const confirmer = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
const annuler = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
const toastAdd = vi.fn();

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 7, roles: ['agent'] } }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: toastAdd }) }));
vi.mock('@/lib/queries/visits', () => ({
  useVisit: () => ({ data: { data: etat.visit }, isLoading: false, isError: false }),
  useCancelVisit: () => annuler,
  useCompleteVisit: () => neutre,
  useConfirmVisit: () => confirmer,
  useUpdateVisit: () => neutre,
  useClaimVisit: () => neutre,
  useProposeVisitSlot: () => neutre,
  useMarkVisitNoShow: () => neutre,
}));

const MESSAGE_API = 'Cette visite ne peut plus être annulée.';

function visite(overrides: Partial<PropertyVisit> = {}): PropertyVisit {
  return {
    id: 1,
    property_id: 10,
    visitor_id: null,
    customer_id: null,
    agent_id: 7,
    type: 'in_person',
    status: 'scheduled',
    scheduled_at: new Date(Date.now() + 2 * 3600_000).toISOString(),
    duration_minutes: 30,
    property: { id: 10, title: 'Villa à Almadies', slug: 'villa-almadies' },
    abilities: { manage: true },
    ...overrides,
  };
}

describe('<VisitDetail> — erreur d’un geste de transition (P182.01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    etat.visit = visite();
  });

  it('affiche le message de l’API quand la confirmation échoue', async () => {
    confirmer.mutateAsync.mockRejectedValue(new ApiError(422, { message: MESSAGE_API }));
    render(withIntl(<VisitDetail id={1} />));

    await userEvent.click(screen.getByRole('button', { name: 'Confirmer la visite' }));

    expect(confirmer.mutateAsync).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE_API);
    expect(toastAdd).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
  });

  it('affiche le message de l’API dans le dialogue d’annulation, qui reste ouvert', async () => {
    annuler.mutateAsync.mockRejectedValue(new ApiError(422, { message: MESSAGE_API }));
    render(withIntl(<VisitDetail id={1} />));

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    const dialogue = await screen.findByRole('dialog');
    await userEvent.type(within(dialogue).getByRole('textbox'), 'Plus disponible');
    await userEvent.click(within(dialogue).getByRole('button', { name: 'Annuler la visite' }));

    expect(annuler.mutateAsync).toHaveBeenCalledTimes(1);
    expect(await within(dialogue).findByRole('alert')).toHaveTextContent(MESSAGE_API);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
