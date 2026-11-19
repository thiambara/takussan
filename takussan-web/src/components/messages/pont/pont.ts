'use client';

import type { PontDuParticipant, RelationAuFil } from '@/types/message';

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
export const ETATS_DE_RELAIS = ['queued', 'sent', 'delivered', 'read', 'failed', 'sms_fallback'] as const;
export function cleDeLEtat(etat: string | null | undefined): (typeof ETATS_DE_RELAIS)[number] | 'autre' {
  return (ETATS_DE_RELAIS as readonly string[]).includes(etat ?? '') ? (etat as (typeof ETATS_DE_RELAIS)[number]) : 'autre';
}

/** La fenêtre de 24 h d'un participant joint est-elle ouverte à `maintenant` ? Jugé sur `fenetre_jusqu_a` seul. */
export function fenetreOuverte(pont: PontDuParticipant, maintenant: number): boolean {
  if (!pont.fenetre_jusqu_a) return false;
  const fin = Date.parse(pont.fenetre_jusqu_a);
  return Number.isFinite(fin) && fin > maintenant;
}

/** Un participant joint, sans opposition : le pont lui relaie ce qui s'écrit. */
export function relaye(pont: PontDuParticipant | undefined): pont is PontDuParticipant {
  return Boolean(pont?.joint) && !pont?.opposition_at;
}

/**
 * AC3 — les destinataires joints dont la fenêtre est FERMÉE : ce que l'agent écrit leur partira en message type
 * (le seul gabarit `pont_nouveau_message`, ADR-0132 § 4). Vide : le composeur n'annonce rien.
 */
export function destinatairesEnMessageType(
  participants: ReadonlyArray<RelationAuFil> | undefined,
  maintenant: number,
  moi?: number | null,
): RelationAuFil[] {
  return (participants ?? []).filter((p) => p.user_id !== moi && relaye(p.pont) && !fenetreOuverte(p.pont, maintenant));
}

/** Les destinataires joints dont la fenêtre est OUVERTE. */
export function destinatairesFenetreOuverte(
  participants: ReadonlyArray<RelationAuFil> | undefined,
  maintenant: number,
  moi?: number | null,
): RelationAuFil[] {
  return (participants ?? []).filter((p) => p.user_id !== moi && relaye(p.pont) && fenetreOuverte(p.pont, maintenant));
}

// « Joindre par WhatsApp » (POST `…/pont/invitations`, refus à code) reviendra avec la route de TCK-2981 : retiré
// de cette PR pour que `check-front-routes` ne rougisse pas sur une route qui n'existe pas encore.
