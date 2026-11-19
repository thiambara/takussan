'use client';

import { useApiMutation } from '@/hooks/useApiQuery';
import { ApiError } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';
import { conversationContextQueryKey } from '@/lib/queries/conversations-cles';
import type { ConversationContext, PontDuParticipant } from '@/types/message';

/**
 * TCK-2984 (ADR-0132 § 0) — le pont à l'écran de l'agent.
 *
 * Le canal est une CHAÎNE LIBRE déclarée par un pilote (`app`, `whatsapp`, `sms` aujourd'hui, d'autres demain) :
 * ce fichier est le SEUL endroit où un nom de canal s'écrit, pour lui donner un libellé connu ; toute autre valeur
 * rend le libellé générique (« par une autre messagerie »). Un canal neuf ne casse pas l'écran.
 *
 * Rien n'est déduit : `relays`, `pont`, `action_link` ne se rendent que si la réponse les porte (l'API les
 * réserve au personnel de l'agence du fil, TCK-2981, TCK-2982).
 */
export const CANAUX_CONNUS = ['app', 'whatsapp', 'sms'] as const;
export type CanalConnu = (typeof CANAUX_CONNUS)[number];

/** La clé de libellé d'un canal : connue, ou `autre`. */
export function cleDuCanal(canal: string | null | undefined): CanalConnu | 'autre' {
  return (CANAUX_CONNUS as readonly string[]).includes(canal ?? '') ? (canal as CanalConnu) : 'autre';
}

/** Les états de relais que ce front sait dire ; un autre rend `autre`. */
/** TCK-2981 — `relays[].status`, des codes de l'API. */
export const ETATS_DE_RELAIS = ['en_attente_accord', 'envoye', 'remis', 'lu', 'echec', 'non_envoye'] as const;
export function cleDeLEtat(etat: string | null | undefined): (typeof ETATS_DE_RELAIS)[number] | 'autre' {
  return (ETATS_DE_RELAIS as readonly string[]).includes(etat ?? '') ? (etat as (typeof ETATS_DE_RELAIS)[number]) : 'autre';
}

/** Un participant et l'état de son pont (une ligne de `context.pont`). */
export type ParticipantDuPont = { readonly user_id: number; readonly pont: PontDuParticipant };

/**
 * `context.pont` (TCK-2981) en liste : `undefined` quand la clé est absente (lecteur qui n'est pas personnel). Seule
 * entrée des éléments du pont : ils ne lisent rien d'autre du contexte.
 */
export function participantsDuPont(contexte: Pick<ConversationContext, 'pont'> | null | undefined): ParticipantDuPont[] | undefined {
  const pont = contexte?.pont;
  if (!pont || typeof pont !== 'object') return undefined;
  return Object.entries(pont).flatMap(([id, ligne]) => (Number.isFinite(Number(id)) && ligne ? [{ user_id: Number(id), pont: ligne }] : []));
}

/** La fenêtre de 24 h d'un participant joint est-elle ouverte à `maintenant` ? Jugé sur `fenetre_jusqu_a` seul. */
export function fenetreOuverte(pont: PontDuParticipant, maintenant: number): boolean {
  if (!pont.fenetre_jusqu_a) return false;
  const fin = Date.parse(pont.fenetre_jusqu_a);
  return Number.isFinite(fin) && fin > maintenant;
}

/** Un participant joint, sans opposition : le pont lui relaie ce qui s'écrit. */
export function relaye(pont: PontDuParticipant | undefined): boolean {
  return Boolean(pont?.joint) && !pont?.opposition_at;
}

/**
 * AC3 — les destinataires joints dont la fenêtre est FERMÉE : ce que l'agent écrit leur partira en message type
 * (le seul gabarit `pont_nouveau_message`, ADR-0132 § 4). Vide : le composeur n'annonce rien.
 */
export function destinatairesEnMessageType(
  participants: ReadonlyArray<ParticipantDuPont> | undefined,
  maintenant: number,
  moi?: number | null,
): ParticipantDuPont[] {
  return (participants ?? []).filter((p) => p.user_id !== moi && relaye(p.pont) && !fenetreOuverte(p.pont, maintenant));
}

/** Les destinataires joints dont la fenêtre est OUVERTE. */
export function destinatairesFenetreOuverte(
  participants: ReadonlyArray<ParticipantDuPont> | undefined,
  maintenant: number,
  moi?: number | null,
): ParticipantDuPont[] {
  return (participants ?? []).filter((p) => p.user_id !== moi && relaye(p.pont) && fenetreOuverte(p.pont, maintenant));
}

/** Les refus à code de `POST …/pont/invitations` (TCK-2981) ; un autre rend `inconnu`. */
export const REFUS_D_INVITATION = [
  'pont.not_participant',
  'pont.no_phone',
  'pont.invalid_phone',
  'pont.opted_out',
  'pont.already_joined',
  'pont.customer_not_in_room',
  'pont.numero_deja_a_un_compte',
] as const;

export function cleDuRefus(err: unknown): string {
  if (!(err instanceof ApiError) || !err.data || typeof err.data !== 'object') return 'inconnu';
  const code = (err.data as { code?: unknown }).code;
  return typeof code === 'string' && (REFUS_D_INVITATION as readonly string[]).includes(code) ? code.slice('pont.'.length) : 'inconnu';
}

/**
 * « Joindre par WhatsApp » : un seul appel (le bouton se désactive pendant l'envoi), puis la relecture du
 * contexte, dont `pont.joint` dit « jointe » (déjà d'accord sur ce numéro) ou non (« invitation envoyée »).
 */
export type CibleDInvitation = { readonly user_id: number } | { readonly customer_id: number };

/**
 * TCK-2981 (AC6) — la cible : un participant (`user_id`), ou la fiche du locataire SANS COMPTE du bail de la salle
 * (`customer_id`), qui n'est pas un participant du fil.
 */
export function useInvitationAuPont(conversationId: number) {
  return useApiMutation<unknown, CibleDInvitation>(
    { path: cheminApi`/api/conversations/${conversationId}/pont/invitations`, method: 'POST' },
    { invalidate: [conversationContextQueryKey(conversationId)] },
  );
}
