import type { Conversation } from '@/types/message';

/**
 * TCK-2963 (ADR-0128 § 2, maquette `fil-salle-bail` A) — la SALLE d'un bail ou d'une réservation : le fil
 * unique de l'objet (TCK-2960), dont les membres sont exactement ses parties. Décision 3a du porteur : ni la
 * visite ni l'état des lieux n'ont de salle.
 *
 * Fonctions pures : ce module n'importe aucun écran. Il est lu par la liste, l'en-tête et la page de la
 * messagerie, que le widget flottant atteint aussi (frontière i18n de la racine).
 */

export type NatureDeSalle = 'lease' | 'booking';

export interface ObjetDeLaSalle {
  readonly nature: NatureDeSalle;
  readonly id: number;
}

export function estUneSalle(conversation: Pick<Conversation, 'type'> | null | undefined): boolean {
  return conversation?.type === 'lease' || conversation?.type === 'booking';
}

/**
 * L'objet d'une salle : son sujet (`subject_type`/`subject_id`, TCK-2957) ; à défaut, pour un bail, le
 * contexte `lease_id` que la salle porte aussi (TCK-2960). `null` hors d'une salle.
 */
export function objetDeLaSalle(
  conversation: Pick<Conversation, 'type' | 'subject_type' | 'subject_id' | 'lease_id'> | null | undefined,
): ObjetDeLaSalle | null {
  if (!conversation) return null;
  const nature = conversation.type;
  if (nature !== 'lease' && nature !== 'booking') return null;
  const id =
    conversation.subject_type === nature && conversation.subject_id
      ? conversation.subject_id
      : nature === 'lease'
        ? conversation.lease_id
        : null;
  return id ? { nature, id } : null;
}

/**
 * Les statuts d'un bail FINI, pour lesquels l'API rend la salle en lecture seule (`ConversationAccess`,
 * TCK-2960 : une liste explicite, pas « hors `ONGOING_STATUSES` », qui fermerait aussi le brouillon).
 * Le front n'en déduit aucun droit : il lit `abilities.can_send_message`. Cette liste ne sert qu'à dire
 * POURQUOI la saisie a disparu.
 */
export const STATUTS_DE_BAIL_FINI: readonly string[] = ['expired', 'terminated', 'renewed'];

/** Les statuts d'une réservation close sans avoir eu lieu (les causes de `BookingClosed`, TCK-2960). */
export const STATUTS_DE_RESERVATION_CLOSE: readonly string[] = ['rejected', 'cancelled', 'expired'];

/**
 * La raison de la lecture seule, en CODE (la clé `messaging.salle.lectureSeule.<code>`) : l'API ne rend que
 * le booléen. `ferme` pour un fil fermé, `bailFini` et `reservationClose` d'après le statut de l'objet lu,
 * `autre` sinon (bailleur parti ou suspendu, objet pas encore lu).
 */
export function raisonDeLectureSeule(
  conversation: Pick<Conversation, 'type' | 'status'> | null | undefined,
  statutDeLObjet: string | null | undefined,
): 'ferme' | 'bailFini' | 'reservationClose' | 'autre' {
  if (conversation?.status === 'closed') return 'ferme';
  if (conversation?.type === 'lease' && statutDeLObjet && STATUTS_DE_BAIL_FINI.includes(statutDeLObjet)) return 'bailFini';
  if (conversation?.type === 'booking' && statutDeLObjet && STATUTS_DE_RESERVATION_CLOSE.includes(statutDeLObjet)) return 'reservationClose';
  return 'autre';
}

/** Qui lit la salle d'un bail : il ne décide d'aucun droit, seulement des LIBELLÉS (« Prochain loyer »). */
export type LecteurDuBail = 'locataire' | 'bailleur' | 'agent' | 'personnel';

interface PartiesDuBail {
  readonly landlord_id: number | null;
  readonly agent_id?: number | null;
  readonly tenant?: { readonly user_id?: number | null } | null;
}

export function lecteurDuBail(bail: PartiesDuBail, userId: number | null | undefined): LecteurDuBail {
  if (userId == null) return 'personnel';
  if (bail.tenant?.user_id != null && bail.tenant.user_id === userId) return 'locataire';
  if (bail.landlord_id === userId) return 'bailleur';
  if (bail.agent_id != null && bail.agent_id === userId) return 'agent';
  return 'personnel';
}

/**
 * La qualité d'un MEMBRE de la salle, jugée sur les identifiants des parties — jamais sur les blocs
 * `landlord` ou `agent` de la lecture du bail, qui portent un téléphone pour le personnel (TCK-2906) :
 * la salle ne montre aucune coordonnée (contrainte du ticket), elle ne les lit donc pas.
 */
export type QualiteDuMembre = 'locataire' | 'bailleur' | 'agent' | 'candidat' | 'contact' | 'membre';

export function qualiteDansLeBail(bail: PartiesDuBail, userId: number): QualiteDuMembre {
  if (bail.tenant?.user_id != null && bail.tenant.user_id === userId) return 'locataire';
  if (bail.landlord_id === userId) return 'bailleur';
  if (bail.agent_id != null && bail.agent_id === userId) return 'agent';
  return 'membre';
}

export function qualiteDansLaReservation(
  reservation: { readonly customer?: { readonly user_id?: number | null } | null },
  userId: number,
): QualiteDuMembre {
  // Les membres d'une salle de réservation : le candidat et le contact principal du bien (TCK-2960).
  return reservation.customer?.user_id != null && reservation.customer.user_id === userId ? 'candidat' : 'contact';
}

/** Les membres actuels d'une salle (participation sans `left_at`), dans l'ordre de l'API. */
export function membresActuels(conversation: Pick<Conversation, 'participants'> | null | undefined) {
  return (conversation?.participants ?? []).filter((p) => !p.left_at);
}
