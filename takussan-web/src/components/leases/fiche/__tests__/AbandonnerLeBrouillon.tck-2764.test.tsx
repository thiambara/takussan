/**
 * TCK-2764 (AC9) — abandonner un brouillon de bail : l'action n'existe que sur un brouillon, cède la
 * place à sa raison quand une échéance est saisie, et son dialogue nomme la candidature d'origine
 * avec une case DÉCOCHÉE. Décochée, un seul `DELETE` ; cochée, le geste de la candidature suit, sur
 * le statut que la réponse du `DELETE` rend.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import type { LeaseWithRelations } from '@/lib/queries/leases';
import { withIntl } from '@/test/intl';
import type { BookingStatus } from '@/types/booking';
import type { LeaseAbilities, LeasePayment } from '@/types/lease';
import { AbandonnerLeBrouillon } from '../AbandonnerLeBrouillon';
import { abandonEmpeche, gestesSecondaires } from '../gestes';

const apiRequestMock = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
const toastAdd = vi.fn();
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: toastAdd }) }));

const GESTION: LeaseAbilities = {
  renew: false,
  review_rent: false,
  record_payment: true,
  refund_deposit: false,
  request_early_termination: false,
  update: true,
  add_document: true,
  download_contract: true,
  leave_review: false,
  give_notice: false,
  abandon: true,
};

function bail(partiel: Partial<LeaseWithRelations> = {}): LeaseWithRelations {
  return {
    id: 7,
    status: 'draft',
    type: 'residential_rent',
    booking_id: 31,
    abilities: GESTION,
    tenant: { id: 3, first_name: 'Awa', last_name: 'Ndiaye' },
    origin_booking: { id: 31, status: 'confirmed' },
    ...partiel,
  } as LeaseWithRelations;
}

function echeance(partiel: Partial<LeasePayment>): LeasePayment {
  return { id: 1, payment_type: 'deposit', status: 'pending', ...partiel } as LeasePayment;
}

describe('gestesSecondaires — l’abandon', () => {
  it('sur un brouillon sans échéance saisie, l’abandon est le dernier geste', () => {
    expect(gestesSecondaires(bail(), []).at(-1)).toBe('abandonner');
    expect(abandonEmpeche(bail(), [])).toBe(false);
  });

  it('jamais sur un autre statut, ni sans l’ability, ni pendant que les échéances chargent', () => {
    for (const status of ['pending_signature', 'active', 'terminating', 'terminated'] as const) {
      expect(gestesSecondaires(bail({ status }), [])).not.toContain('abandonner');
    }
    expect(gestesSecondaires(bail({ abilities: { ...GESTION, abandon: false } }), [])).not.toContain('abandonner');
    expect(gestesSecondaires(bail(), undefined)).not.toContain('abandonner');
    expect(abandonEmpeche(bail(), undefined)).toBe(false);
  });

  it('une échéance saisie (caution en attente) remplace l’action par sa raison ; annulée, elle ne compte plus', () => {
    const caution = [echeance({ status: 'pending' })];
    expect(gestesSecondaires(bail(), caution)).not.toContain('abandonner');
    expect(abandonEmpeche(bail(), caution)).toBe(true);

    const annulee = [echeance({ status: 'cancelled' })];
    expect(gestesSecondaires(bail(), annulee)).toContain('abandonner');
    expect(abandonEmpeche(bail(), annulee)).toBe(false);
  });
});

function monter(lease: LeaseWithRelations = bail()) {
  const garde = vi.fn<GardeDoubleFacteurFn>(async () => true);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenChange = vi.fn();
  render(
    withIntl(
      <QueryClientProvider client={client}>
        <ContexteGardeDoubleFacteur.Provider value={garde}>
          <AbandonnerLeBrouillon lease={lease} open onOpenChange={onOpenChange} />
        </ContexteGardeDoubleFacteur.Provider>
      </QueryClientProvider>,
    ),
  );
  return { onOpenChange };
}

function reponseDuDelete(status: BookingStatus | null) {
  return { data: { id: 7, abandoned_at: '2026-11-13T09:30:00+00:00', origin_booking: status ? { id: 31, status } : null } };
}

const confirmer = () => fireEvent.click(screen.getByRole('button', { name: 'Abandonner le brouillon' }));
const appels = () => apiRequestMock.mock.calls.map(([chemin, options]) => `${(options as { method: string }).method} ${chemin as string}`);

describe('<AbandonnerLeBrouillon>', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    push.mockReset();
    toastAdd.mockReset();
  });

  it('dit l’effet, nomme la candidature d’origine, et sa case est décochée', () => {
    monter();

    expect(screen.getByText(/Le brouillon disparaît des listes/)).toBeInTheDocument();
    expect(screen.getByText('Candidature de Awa Ndiaye, acceptée')).toBeInTheDocument();
    expect(screen.getByText(/aucune autre candidature sur ce logement ne peut l'être/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Fermer aussi cette candidature/ })).not.toBeChecked();
  });

  it('décochée : un seul DELETE, avec le motif, puis retour à la liste et confirmation', async () => {
    apiRequestMock.mockResolvedValueOnce(reponseDuDelete('confirmed'));
    monter();
    fireEvent.change(screen.getByLabelText('Motif (facultatif)'), { target: { value: ' Le candidat se désiste ' } });
    confirmer();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/app/leases'));
    expect(appels()).toEqual(['DELETE /api/leases/7']);
    expect(apiRequestMock.mock.calls[0][1].body).toEqual({ reason: 'Le candidat se désiste' });
    expect(toastAdd).toHaveBeenCalledWith({ title: 'Brouillon abandonné.', type: 'success' });
  });

  it('cochée sur une candidature acceptée : DELETE puis POST …/cancel', async () => {
    apiRequestMock.mockResolvedValueOnce(reponseDuDelete('confirmed')).mockResolvedValueOnce({ data: {} });
    monter();
    fireEvent.click(screen.getByRole('checkbox', { name: /Fermer aussi cette candidature/ }));
    confirmer();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/app/leases'));
    expect(appels()).toEqual(['DELETE /api/leases/7', 'POST /api/bookings/31/cancel']);
    expect(toastAdd).toHaveBeenCalledWith({ title: 'Brouillon abandonné, et candidature fermée.', type: 'success' });
  });

  it('cochée sur une candidature en attente : DELETE puis POST …/reject', async () => {
    apiRequestMock.mockResolvedValueOnce(reponseDuDelete('pending')).mockResolvedValueOnce({ data: {} });
    monter(bail({ origin_booking: { id: 31, status: 'pending' } }));
    expect(screen.getByText('Candidature de Awa Ndiaye, en attente')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /Fermer aussi cette candidature/ }));
    confirmer();

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(appels()).toEqual(['DELETE /api/leases/7', 'POST /api/bookings/31/reject']);
  });

  it('cochée : le geste suit le statut RENDU par le DELETE, pas celui que la fiche a lu', async () => {
    // La fiche a lu « acceptée » ; entre-temps, la candidature est revenue en attente.
    apiRequestMock.mockResolvedValueOnce(reponseDuDelete('pending')).mockResolvedValueOnce({ data: {} });
    monter();
    fireEvent.click(screen.getByRole('checkbox', { name: /Fermer aussi cette candidature/ }));
    confirmer();

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(appels()).toEqual(['DELETE /api/leases/7', 'POST /api/bookings/31/reject']);
  });

  it('la fermeture échoue : le brouillon reste abandonné, et l’échec se dit', async () => {
    apiRequestMock.mockResolvedValueOnce(reponseDuDelete('confirmed')).mockRejectedValueOnce(new Error('panne'));
    monter();
    fireEvent.click(screen.getByRole('checkbox', { name: /Fermer aussi cette candidature/ }));
    confirmer();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/app/leases'));
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining('la candidature n'), type: 'error' }));
    expect(toastAdd).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
  });

  it('le DELETE échoue : l’erreur se dit dans le dialogue, rien d’autre ne part, on reste sur la fiche', async () => {
    apiRequestMock.mockRejectedValueOnce(new Error('refus'));
    monter();
    fireEvent.click(screen.getByRole('checkbox', { name: /Fermer aussi cette candidature/ }));
    confirmer();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(appels()).toEqual(['DELETE /api/leases/7']);
    expect(push).not.toHaveBeenCalled();
  });

  it('sans candidature ouverte, ni nom ni case', () => {
    monter(bail({ booking_id: null, origin_booking: null }));
    expect(screen.queryByTestId('candidature-d-origine')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
