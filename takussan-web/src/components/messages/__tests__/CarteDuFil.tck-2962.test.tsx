/**
 * TCK-2962 (ADR-0128) — la carte du fil, rendue pour SON lecteur depuis `object` (la projection et ses
 * `abilities`), jamais depuis `metadata.data` ni un rôle :
 *
 * · AC1 — le devis lu par le demandeur n'affiche aucun montant, même si la réponse en porte un ;
 * · AC2 — un geste n'apparaît que si son `ability` est vraie, et appelle la route de L'OBJET (aucune
 *   route sous `/api/conversations`) ;
 * · AC3 — `{indisponible: true}` rend une carte sans titre ni détail ;
 * · un 403 se dit comme un refus, et le fil se relit.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { withIntl } from '@/test/intl';
import type { Message } from '@/types/message';

const apiRequest = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

// Le sélecteur de date (calendrier en popover) est doublé d'un champ texte, comme dans les tests de TCK-2918.
vi.mock('@/components/ui/date-time-picker', () => ({
  DateTimePicker: ({ id, value, onValueChange }: { id?: string; value?: string; onValueChange: (v: string) => void }) => (
    <input id={id} value={value ?? ''} onChange={(e) => onValueChange(e.target.value)} />
  ),
}));

const { CarteDuFil } = await import('../cartes/CarteDuFil');

let client: QueryClient;

function monter(message: Message) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <ul>
          <CarteDuFil message={message} conversationId={7} moi={false} auteur />
        </ul>
      </QueryClientProvider>,
    ),
  );
}

function evenement(type: string, code: string, object: Record<string, unknown>, extra: Partial<Message> = {}): Message {
  return {
    id: 50,
    conversation_id: 7,
    sender_id: null,
    sender: null,
    content: code,
    type: 'event',
    attachments: [],
    metadata: { object: { type, id: Number(object.id ?? 1) }, code, data: {} },
    object: object as Message['object'],
    action_attendue: true,
    created_at: '2026-11-18T11:40:00Z',
    updated_at: '2026-11-18T11:40:00Z',
    ...extra,
  };
}

/** Un montant écrit à la française ou à l'anglaise : « 85 000 », « 85,000 », « 85000 ». */
const UN_MONTANT = /85[\s  ,.]?000/;

const DEVIS = {
  id: 4,
  title: 'Fuite sous l’évier',
  status: 'quote_submitted',
  requester_id: 1,
  quote_amount: 85000,
  quote_currency: 'XOF',
  estimated_cost: 90000,
  assignee: { id: 12, name: 'Astou Sy' },
};

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockResolvedValue({ data: {} });
});

function cheminsAppeles(): string[] {
  return apiRequest.mock.calls.map(([chemin]) => String(chemin));
}

describe('AC1 — le devis lu par le demandeur ne porte aucun montant', () => {
  it('le locataire lit « l’agence prépare les travaux », sans montant, même si la réponse en contient un', () => {
    const { container } = monter(
      evenement('maintenance_request', 'maintenance.quote_submitted', {
        ...DEVIS,
        abilities: { can_decide_quote: false, can_view_quote_pdf: false, can_request_reschedule: true },
      }),
    );

    expect(screen.getByText('L’agence prépare les travaux')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(UN_MONTANT);
    expect(container.textContent).not.toMatch(/90[\s  ,.]?000/);
    expect(screen.queryByRole('button', { name: 'Approuver le devis' })).toBeNull();
  });

  it('le personnel qui décide lit le montant, l’état qui l’attend, et ses deux gestes', () => {
    const { container } = monter(
      evenement('maintenance_request', 'maintenance.quote_submitted', {
        ...DEVIS,
        abilities: { can_decide_quote: true, can_view_quote_pdf: true },
      }),
    );

    expect(container.textContent).toMatch(UN_MONTANT);
    expect(screen.getByText('À vous d’approuver')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approuver le devis' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refuser' })).toBeInTheDocument();
  });

  it('le prestataire lit son devis (droit de le lire) sans geste de décision', () => {
    const { container } = monter(
      evenement('maintenance_request', 'maintenance.quote_submitted', {
        ...DEVIS,
        abilities: { can_decide_quote: false, can_view_quote_pdf: true },
      }),
    );

    expect(container.textContent).toMatch(UN_MONTANT);
    expect(screen.queryByRole('button', { name: 'Approuver le devis' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Refuser' })).toBeNull();
  });
});

describe('AC2 — un geste n’existe que par son `ability`, et appelle la route de l’objet', () => {
  it('« Approuver le devis » poste sur la route du devis, jamais sous /api/conversations, puis relit le fil', async () => {
    monter(evenement('maintenance_request', 'maintenance.quote_submitted', { ...DEVIS, abilities: { can_decide_quote: true } }));
    const relu = vi.spyOn(client, 'invalidateQueries');

    fireEvent.click(screen.getByRole('button', { name: 'Approuver le devis' }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    expect(cheminsAppeles()).toEqual(['/api/maintenance-requests/4/quote/approve']);
    expect(apiRequest.mock.calls[0]![1]).toMatchObject({ method: 'POST' });
    expect(cheminsAppeles().some((c) => c.startsWith('/api/conversations'))).toBe(false);
    await waitFor(() =>
      expect(relu.mock.calls.map(([f]) => f?.queryKey)).toContainEqual(['conversations', 7, 'messages-infinite']),
    );
    // La fiche de l'intervention ne garde pas l'état d'avant le geste.
    expect(relu.mock.calls.map(([f]) => f?.queryKey)).toContainEqual(['maintenance']);
  });

  it('« Refuser » un devis demande un motif, puis poste sur la route du refus', async () => {
    monter(evenement('maintenance_request', 'maintenance.quote_submitted', { ...DEVIS, abilities: { can_decide_quote: true } }));

    fireEvent.click(screen.getByRole('button', { name: 'Refuser' }));
    const envoyer = await screen.findByRole('button', { name: 'Refuser le devis' });
    expect(envoyer).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Le motif du refus'), { target: { value: 'Trop cher pour ce joint.' } });
    fireEvent.click(envoyer);

    await waitFor(() => expect(cheminsAppeles()).toEqual(['/api/maintenance-requests/4/quote/reject']));
    expect(apiRequest.mock.calls[0]![1]).toMatchObject({ body: { reason: 'Trop cher pour ce joint.' } });
  });

  it('« Confirmer ce moment » d’une visite : présent sur `confirm`, absent sinon', async () => {
    const visite = { id: 9, status: 'scheduled', scheduled_at: '2026-11-21T10:00:00Z', property: { id: 2, title: 'Mermoz' } };
    const { unmount } = monter(evenement('property_visit', 'visit.rescheduled', { ...visite, abilities: { confirm: false } }));
    expect(screen.queryByRole('button', { name: 'Confirmer ce moment' })).toBeNull();
    unmount();

    monter(evenement('property_visit', 'visit.rescheduled', { ...visite, abilities: { confirm: true } }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer ce moment' }));
    await waitFor(() => expect(cheminsAppeles()).toEqual(['/api/property-visits/9/confirm']));
  });

  it('un 403 de la route se dit comme un refus, et le fil se relit', async () => {
    apiRequest.mockRejectedValue(new ApiError(403, { message: 'This action is unauthorized.' }));
    monter(
      evenement('property_visit', 'visit.rescheduled', {
        id: 9,
        status: 'scheduled',
        scheduled_at: '2026-11-21T10:00:00Z',
        abilities: { confirm: true },
      }),
    );
    const relu = vi.spyOn(client, 'invalidateQueries');

    fireEvent.click(screen.getByRole('button', { name: 'Confirmer ce moment' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ce geste ne vous est plus permis. La carte a été mise à jour.');
    expect(screen.queryByText('This action is unauthorized.')).toBeNull();
    expect(relu.mock.calls.map(([f]) => f?.queryKey)).toContainEqual(['conversations', 7, 'messages-infinite']);
  });

  it('réservation : confirmer et refuser (en deux temps) postent sur les routes de la réservation', async () => {
    monter(
      evenement('booking', 'booking.requested', {
        id: 3,
        status: 'pending',
        start_date: '2026-12-01',
        end_date: '2026-12-05',
        property: { id: 2, title: 'Villa Saly' },
        abilities: { confirm: true, reject: true, cancel: true },
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Refuser' }));
    expect(apiRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer le refus' }));
    await waitFor(() => expect(cheminsAppeles()).toEqual(['/api/bookings/3/reject']));
  });

  it('réservation : « Confirmer la réservation » poste sur sa route et relit la fiche de la réservation', async () => {
    monter(
      evenement('booking', 'booking.requested', {
        id: 3,
        status: 'pending',
        property: { id: 2, title: 'Villa Saly' },
        abilities: { confirm: true, reject: false, cancel: true },
      }),
    );
    const relu = vi.spyOn(client, 'invalidateQueries');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la réservation' }));
    await waitFor(() => expect(cheminsAppeles()).toEqual(['/api/bookings/3/confirm']));
    await waitFor(() => expect(relu.mock.calls.map(([f]) => f?.queryKey)).toContainEqual(['bookings', 'detail', 3]));
  });

  it('réservation : aucun geste sans `confirm` ni `reject`', () => {
    monter(
      evenement('booking', 'booking.confirmed', {
        id: 3,
        status: 'pending',
        property: { id: 2, title: 'Villa Saly' },
        abilities: { confirm: false, reject: false, cancel: true },
      }),
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('En attente')).toBeInTheDocument();
  });
});

describe('Loyer — une carte, plusieurs lectures', () => {
  const ECHEANCE = {
    id: 31,
    lease_id: 8,
    payment_type: 'rent',
    status: 'late',
    period_start: '2026-12-01',
    due_date: '2026-12-05',
    amount: 470000,
    amount_due: 470000,
    currency: 'XOF',
    is_overdue: true,
  };

  it('le locataire : « Payer » mène au parcours de paiement du locataire ; ni encaissement ni relance', () => {
    monter(evenement('lease_payment', 'lease_payment.overdue', { ...ECHEANCE, abilities: { pay: true, remind: false, record_payment: false } }));

    expect(screen.getByRole('link', { name: 'Payer' })).toHaveAttribute('href', '/app/payments');
    expect(screen.getByText('En retard')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Encaisser à la main' })).toBeNull();
    expect(screen.queryByText(/Relancer/)).toBeNull();
  });

  it('le personnel : « Encaisser à la main » poste sur l’échéance avec son moyen ; ni payer ni « Relancer »', async () => {
    monter(evenement('lease_payment', 'lease_payment.overdue', { ...ECHEANCE, abilities: { pay: false, remind: true, record_payment: true } }));

    expect(screen.queryByRole('link', { name: 'Payer' })).toBeNull();
    expect(screen.queryByText(/Relancer/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Encaisser à la main' }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Virement' }));
    fireEvent.click(screen.getByRole('button', { name: 'Encaisser' }));

    await waitFor(() => expect(cheminsAppeles()).toEqual(['/api/lease-payments/31/mark-paid']));
    expect(apiRequest.mock.calls[0]![1]).toMatchObject({ method: 'POST', body: { payment_method: 'bank_transfer' } });
  });

  it('payée : l’état est fait, sans geste', () => {
    monter(
      evenement('lease_payment', 'lease_payment.paid', {
        ...ECHEANCE,
        status: 'paid',
        is_overdue: false,
        amount_due: 0,
        paid_at: '2026-12-03T09:12:00Z',
        abilities: { pay: false, remind: false, record_payment: false },
      }),
    );
    expect(screen.getByText('Payé')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('État des lieux, passage, bail', () => {
  it('« Relire et signer » mène au parcours de signature quand le lecteur peut signer, sinon à la fiche', () => {
    const edl = { id: 5, type: 'move_in', status: 'pending_signature', tenant_signed: false, owner_signed: true };
    const { unmount } = monter(evenement('inventory', 'inventory.awaiting_signature', { ...edl, can_sign_as: ['tenant'] }));
    expect(screen.getByRole('link', { name: 'Relire et signer' })).toHaveAttribute('href', '/app/inventories/5');
    expect(screen.getByText('À signer')).toBeInTheDocument();
    unmount();

    monter(evenement('inventory', 'inventory.awaiting_signature', { ...edl, can_sign_as: [] }));
    expect(screen.queryByRole('link', { name: 'Relire et signer' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Voir l’état des lieux' })).toHaveAttribute('href', '/app/inventories/5');
  });

  it('passage : « Proposer un autre moment » envoie un instant à venir sur la route des demandes de créneau', async () => {
    monter(
      evenement('maintenance_request', 'maintenance.slot_set', {
        id: 4,
        title: 'Fuite',
        status: 'assigned',
        scheduled_at: '2026-11-19T10:00:00Z',
        abilities: { can_request_reschedule: true },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Proposer un autre moment' }));
    const champ = await screen.findByLabelText('Moment 1');
    fireEvent.change(champ, { target: { value: '2099-01-15T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer la demande' }));

    await waitFor(() => expect(cheminsAppeles()).toEqual(['/api/maintenance-requests/4/reschedule-requests']));
    const corps = apiRequest.mock.calls[0]![1].body as { proposed_slots: string[] };
    expect(corps.proposed_slots).toHaveLength(1);
    expect(new Date(corps.proposed_slots[0]!).getFullYear()).toBe(2099);
  });

  it('passage : « Proposer un autre moment » seulement sur `can_request_reschedule`, jamais « Confirmer ce moment »', () => {
    const passage = { id: 4, title: 'Fuite', status: 'assigned', scheduled_at: '2026-11-19T10:00:00Z' };
    const { unmount } = monter(evenement('maintenance_request', 'maintenance.slot_set', { ...passage, abilities: { can_request_reschedule: true } }));
    expect(screen.getByRole('button', { name: 'Proposer un autre moment' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmer ce moment' })).toBeNull();
    unmount();

    monter(evenement('maintenance_request', 'maintenance.slot_set', { ...passage, abilities: { can_request_reschedule: false } }));
    expect(screen.queryByRole('button', { name: 'Proposer un autre moment' })).toBeNull();
  });

  it('bail : la fiche du bail, aucun geste', () => {
    monter({
      ...evenement('lease', 'lease.renewed', { id: 8, reference_number: 'BAIL-2026-008', status: 'active', property: { id: 2, title: 'Sacré-Cœur 3' } }),
      type: 'card',
      sender_id: 3,
      sender: { id: 3, full_name: 'Sokhna Sène' },
      action_attendue: undefined,
    });
    expect(screen.getByText('Bail · BAIL-2026-008')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voir le bail' })).toHaveAttribute('href', '/app/leases/8');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(/Sokhna Sène/)).toBeInTheDocument();
  });
});

describe('AC3 — l’objet indisponible', () => {
  it('rend une carte discrète, sans titre ni détail de l’objet', () => {
    const { container } = monter({
      ...evenement('maintenance_request', 'maintenance.quote_submitted', { indisponible: true }),
      type: 'card',
      sender_id: 3,
      sender: { id: 3, full_name: 'Sokhna Sène' },
      metadata: { object: { type: 'maintenance_request', id: 4 }, code: 'maintenance.quote_submitted', data: { provider_name: 'Astou Sy' } },
    });

    const carte = container.querySelector('[data-slot="place-de-la-carte"]')!;
    expect(within(carte as HTMLElement).getByText('Cet élément n’est plus accessible.')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="carte-du-fil"]')).toBeNull();
    expect(container.textContent).not.toMatch(/Devis|Fuite|Astou/);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
