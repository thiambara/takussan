import type { BookingAbilities } from '@/types/booking';

/**
 * TCK-3007 (ADR-0139) — les `abilities` d'une fixture de fiche : la fiche ne montre que les gestes que
 * l'API accorde au lecteur. `permis('confirm', 'reject')` rend toutes les clés, fausses sauf celles-là.
 */
export function permis(...gestes: ReadonlyArray<keyof BookingAbilities>): BookingAbilities {
  const tout: BookingAbilities = {
    confirm: false,
    reject: false,
    cancel: false,
    counter_offer: false,
    answer_counter_offer: false,
    record_payment: false,
    refund: false,
    create_lease: false,
    pay: false,
    upload_dossier_piece: false,
    request_dossier_piece: false,
    manage_guarantors: false,
    leave_review: false,
  };
  for (const g of gestes) tout[g] = true;
  return tout;
}

export type Lecteur = 'personnel' | 'bailleur' | 'client';

interface ReservationDeTest {
  readonly status?: unknown;
  readonly kind?: unknown;
  readonly awaiting?: unknown;
  readonly property?: unknown;
}

/**
 * Les `abilities` que l'API servirait à ce lecteur, dans les grandes lignes de `GestesDeLaReservation`
 * (le personnel tenant les capacités du rôle système d'agent : ni `bookings.refund`). Le premier jour
 * d'un séjour n'y entre pas : c'est une règle de l'API, éprouvée par `BookingGestesTest`. `enPlus`
 * accorde en sus (`refund`, par exemple).
 */
export function gestesServis(b: ReservationDeTest, lecteur: Lecteur, ...enPlus: ReadonlyArray<keyof BookingAbilities>): BookingAbilities {
  const enAttente = b.status === 'pending';
  const ouverte = enAttente || b.status === 'confirmed';
  const dossier = ouverte && (b.kind === 'application' || b.kind === 'offer');
  const aLouer = (b.property as { contract_type?: string } | null | undefined)?.contract_type === 'rent';
  const gestes: Array<keyof BookingAbilities> = [...enPlus];
  if (ouverte) gestes.push('cancel');
  if (lecteur === 'client') {
    if (enAttente && b.awaiting === 'customer') gestes.push('answer_counter_offer');
    if (ouverte && b.kind === 'stay') gestes.push('pay');
    if (dossier) gestes.push('upload_dossier_piece', 'manage_guarantors');
    if (b.status === 'confirmed' || b.status === 'completed') gestes.push('leave_review');
    return permis(...gestes);
  }
  if (enAttente) gestes.push('confirm', 'reject');
  if (ouverte || b.status === 'completed') gestes.push('record_payment');
  if (b.kind === 'application' && b.status === 'confirmed' && aLouer) gestes.push('create_lease');
  if (lecteur === 'personnel') {
    if (enAttente && b.kind === 'offer') gestes.push('counter_offer');
    if (dossier) gestes.push('upload_dossier_piece', 'request_dossier_piece', 'manage_guarantors');
  }
  return permis(...gestes);
}
