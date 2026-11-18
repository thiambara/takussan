/** TCK-2963 — les données de test des salles : le F3 de Sacré-Cœur 3 (maquette `fil-salle-bail`). */
import type { Conversation, Message } from '@/types/message';

export const LOCATAIRE = 10;
export const BAILLEUR = 20;
export const AGENT = 30;

const membre = (id: number, userId: number, nom: string) => ({
  id,
  user_id: userId,
  role: 'member' as const,
  last_read_at: null,
  joined_at: '2026-01-01T00:00:00Z',
  left_at: null,
  user: { id: userId, full_name: nom, avatar_url: null },
});

export function salleDuBail(extra: Partial<Conversation> = {}): Conversation {
  return {
    id: 90,
    subject: null,
    property_id: 3,
    lease_id: 12,
    maintenance_request_id: null,
    subject_type: 'lease',
    subject_id: 12,
    type: 'lease',
    status: 'active',
    created_by: AGENT,
    last_message_at: null,
    last_message_preview: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    property: { id: 3, title: 'F3 Sacré-Cœur 3', slug: 'f3-sacre-coeur-3', main_photo_url: null },
    participants: [membre(1, LOCATAIRE, 'Ousmane Niang'), membre(2, BAILLEUR, 'Mouhamed Sène'), membre(3, AGENT, 'Sokhna Sène')],
    ...extra,
  };
}

export function salleDeLaReservation(extra: Partial<Conversation> = {}): Conversation {
  return salleDuBail({ id: 91, type: 'booking', subject_type: 'booking', subject_id: 7, lease_id: null, ...extra });
}

/** Le téléphone et l'e-mail du bailleur, que `LeaseResource` rend au personnel (TCK-2906) : la salle ne les montre jamais. */
export const TELEPHONE_DU_BAILLEUR = '+221 77 000 00 01';
export const EMAIL_DU_BAILLEUR = 'mouhamed.sene@exemple.sn';

export function bail(extra: Record<string, unknown> = {}) {
  return {
    id: 12,
    reference_number: 'LS-3SC8NQ',
    property_id: 3,
    landlord_id: BAILLEUR,
    agent_id: AGENT,
    tenant_id: 5,
    tenant: { id: 5, user_id: LOCATAIRE },
    agency_id: 1,
    type: 'residential_rent',
    status: 'active',
    start_date: '2026-12-01',
    end_date: '2029-11-30',
    monthly_rent: 470000,
    monthly_charges: null,
    currency: 'XOF',
    deposit_amount: 900000,
    payment_day: 5,
    late_fee_percent: 5,
    notice_period_days: 90,
    next_revision_date: '2027-12-01',
    // `LeaseResource` rend le taux à tous ; seul `commission_amount` est retiré hors du personnel.
    commission_rate: 10,
    next_due: { due_date: '2026-12-05', amount: 470000, status: 'pending' },
    overdue_count: 0,
    overdue_amount: 0,
    // Ce que l'API rendrait au personnel sous `include=landlord` : la salle ne le demande pas, et ne doit
    // rien en montrer même s'il arrivait.
    landlord: { id: BAILLEUR, first_name: 'Mouhamed', last_name: 'Sène', full_name: 'Mouhamed Sène', phone: TELEPHONE_DU_BAILLEUR, email: EMAIL_DU_BAILLEUR },
    ...extra,
  };
}

export function reservation(extra: Record<string, unknown> = {}) {
  return {
    id: 7,
    reference_number: 'RS-7',
    status: 'pending',
    property_id: 3,
    customer_id: 4,
    customer: { id: 4, user_id: LOCATAIRE, first_name: 'Ousmane', last_name: 'Niang' },
    booking_date: '2026-11-10',
    start_date: '2026-12-20',
    end_date: '2026-12-27',
    total_amount: 350000,
    price_at_booking: 50000,
    deposit_amount: 100000,
    currency: 'XOF',
    response_deadline: '2026-11-20T12:00:00Z',
    created_at: '2026-11-10T10:00:00Z',
    property: { id: 3, title: 'F3 Sacré-Cœur 3', slug: 'f3', main_photo_url: null },
    ...extra,
  };
}

let suivant = 1000;
export function message(type: Message['type'], createdAt: string, extra: Partial<Message> = {}): Message {
  suivant += 1;
  return {
    id: suivant,
    conversation_id: 90,
    sender_id: type === 'event' ? null : LOCATAIRE,
    sender: type === 'event' ? null : { id: LOCATAIRE, full_name: 'Ousmane Niang' },
    content: type === 'event' ? 'lease_payment.paid' : 'Bonjour',
    type,
    attachments: [],
    metadata: type === 'event' ? { object: { type: 'lease_payment', id: 3 }, code: 'lease_payment.paid', data: {} } : null,
    action_attendue: false,
    created_at: createdAt,
    updated_at: createdAt,
    ...extra,
  } as Message;
}
