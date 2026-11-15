/**
 * TCK-2653 — la fiche d'une intervention côté agence, sans rendu : le geste principal de la file,
 * ce que « Autre action » propose, et les créneaux proposés au dispatch.
 *
 * **Le serveur dit ce qui est permis** (TCK-592) : rien ici n'invente une transition. Le geste
 * principal se lit sur la file (`file`, TCK-2652) ET sur les `abilities` de la demande ; « Autre
 * action » ne liste, en statuts, que `abilities.transitions`.
 */
import type { MaintenancePriority, MaintenanceRequest, MaintenanceStatus } from '@/types/maintenance';

import { decalerJour } from '@/lib/jour-de-l-api';
import { jourADakar } from '@/lib/visites/par-le-temps';
import { heureMuraleADakar, instantADakar } from '@/lib/visites/heure-de-dakar';

import type { InterventionEnFile } from './files';

/**
 * Le geste principal de la fiche, par file (tableau du ticket) :
 *
 *  · `choisir` — À dispatcher : « Choisir un prestataire », créneau, « Envoyer à … ».
 *  · `relancer` — En retard : « Relancer » (WhatsApp au prestataire) et « Réassigner ».
 *  · `devis` — un devis attend l'agence (`can_decide_quote`) : « Approuver » / « Refuser ».
 *  · `bailleur` — Chez le bailleur : le devis attend le bailleur (« Relancer le bailleur » attend que
 *    l'API serve son contact).
 *  · `suivi` — En cours : la demande est confiée ; on peut relancer le prestataire.
 *  · `confirmer` — À confirmer : « clôture automatique dans N j ».
 *  · `aucun` — terminée, ou une file que la ligne ne porte pas.
 */
export type GestePrincipal = 'choisir' | 'relancer' | 'devis' | 'bailleur' | 'suivi' | 'confirmer' | 'aucun';

export function gestePrincipal(r: Pick<InterventionEnFile, 'file' | 'abilities' | 'assigned_to'>): GestePrincipal {
  const a = r.abilities;
  if (a?.can_decide_quote) return 'devis';
  switch (r.file) {
    case 'a_dispatcher':
      return a?.can_assign ? 'choisir' : 'aucun';
    case 'en_retard':
      return 'relancer';
    case 'chez_le_bailleur':
      return 'bailleur';
    case 'en_cours':
      return 'suivi';
    case 'a_confirmer':
      return 'confirmer';
    default:
      return 'aucun';
  }
}

/** Ce que « Autre action » propose, dans l'ordre de la maquette ; « Annuler » à part, en dernier. */
export interface AutresActions {
  /** « Demander un devis d'abord » — `can_request_quote` (endpoint dédié, pas une transition). */
  readonly devis: boolean;
  /** Les transitions génériques permises, chacune avec sa phrase d'effet. */
  readonly transitions: readonly MaintenanceStatus[];
  /** « Changer la priorité » — le donneur d'ordre (`can_assign`, PATCH `priority`). */
  readonly priorite: boolean;
  /** « Saisir le rapport de fin » — seulement quand un prestataire tient la demande. */
  readonly rapport: boolean;
  /** « Annuler la demande » — si `cancelled` est permise. */
  readonly annuler: boolean;
}

/**
 * Les transitions qu'« Autre action » NE propose jamais en statut nu :
 *  · `completed` — « Terminée » sans rapport (contrainte du ticket) : elle passe par le formulaire ;
 *  · `assigned` — « Assignée » sans prestataire : l'assignation passe par « Choisir un prestataire » ;
 *  · `cancelled` — elle a sa ligne à part, en dernier ;
 *  · les cibles de devis, qui ont leur endpoint (`quote_requested` → « Demander un devis »).
 */
const HORS_DE_LA_LISTE: readonly MaintenanceStatus[] = ['completed', 'assigned', 'cancelled', 'quote_requested', 'quote_submitted', 'awaiting_owner', 'approved', 'rejected'];

export function autresActions(r: Pick<InterventionEnFile, 'file' | 'abilities' | 'assigned_to' | 'status'>): AutresActions {
  const a = r.abilities;
  const permises = a?.transitions ?? [];
  return {
    devis: a?.can_request_quote === true,
    transitions: permises.filter((s) => !HORS_DE_LA_LISTE.includes(s)),
    priorite: a?.can_assign === true && r.status !== 'closed' && r.status !== 'cancelled',
    rapport: a?.can_complete === true && r.assigned_to !== null && (r.file === 'en_cours' || r.file === 'en_retard'),
    annuler: permises.includes('cancelled'),
  };
}

export function aDesAutresActions(x: AutresActions): boolean {
  return x.devis || x.transitions.length > 0 || x.priorite || x.rapport || x.annuler;
}

/** Les priorités, de la plus pressante à la moins pressante (l'ordre où on les choisit). */
export const PRIORITES_DECROISSANTES: readonly MaintenancePriority[] = ['urgent', 'high', 'normal', 'low'];

/* ───────────────────────────── les créneaux ───────────────────────────── */

export type CleDeCreneau = 'aujourdhui16' | 'demain9' | 'demain14';

export interface CreneauPropose {
  readonly cle: CleDeCreneau;
  /** Le début du créneau, en ISO 8601 UTC (`scheduled_at`, accepté par `InstantIso`). */
  readonly debut: string;
}

/**
 * Les créneaux de la maquette : « Auj. 16 h – 18 h » (tant qu'il est avant 16 h à Dakar),
 * « Demain 9 h – 11 h », « Demain 14 h – 16 h ». « Autre… » ouvre le sélecteur de date.
 *
 * Le jour, l'heure murale et l'instant se lisent par les lecteurs de Dakar des visites
 * (`jourADakar`, `heureMuraleADakar`, `instantADakar`) : aucun lecteur de plus ici.
 */
export function creneauxProposes(maintenant: Date): readonly CreneauPropose[] {
  const jour = jourADakar(maintenant);
  const heure = Number(heureMuraleADakar(maintenant).slice(11, 13));
  const demain = decalerJour(jour, 1);
  const creneaux: CreneauPropose[] = [];
  if (heure < 16) creneaux.push({ cle: 'aujourdhui16', debut: instantADakar(jour, '16:00') });
  creneaux.push({ cle: 'demain9', debut: instantADakar(demain, '09:00') });
  creneaux.push({ cle: 'demain14', debut: instantADakar(demain, '14:00') });
  return creneaux;
}

/** Le corps de l'assignation : le COMPTE du prestataire (`user_id`, pas l'id de son profil) et le créneau. */
export function corpsDAssignation(userId: number, debut: string | null): Pick<MaintenanceRequest, 'assigned_to' | 'scheduled_at'> {
  return { assigned_to: userId, scheduled_at: debut };
}

/* ───────────────────────────── la frise ───────────────────────────── */

/**
 * Les étapes de la frise, une par file (audit P2 : « quatre étapes pour douze statuts ») :
 * Signalée (À dispatcher) · Chez le bailleur · En cours (En retard compris) · À confirmer · Terminée.
 */
export type CleDEtape = 'signalee' | 'chez_le_bailleur' | 'en_cours' | 'a_confirmer' | 'terminee';
export const ETAPES_DE_LA_FRISE: readonly CleDEtape[] = ['signalee', 'chez_le_bailleur', 'en_cours', 'a_confirmer', 'terminee'];

/**
 * `faite`, `courante`, `a_venir` ; `sautee` pour « Chez le bailleur » quand la demande l'a dépassée sans
 * devis (rien n'a attendu le bailleur : la frise ne dit pas qu'il a tranché).
 */
export type EtatDEtape = 'faite' | 'courante' | 'a_venir' | 'sautee';

export interface EtapeDeLaFrise {
  readonly cle: CleDEtape;
  readonly etat: EtatDEtape;
  /** La courante est en retard (file `en_retard`) : elle se dit « En retard », en rouge. */
  readonly enRetard?: boolean;
}

const RANG_DE_LA_FILE: Partial<Record<NonNullable<InterventionEnFile['file']>, number>> = {
  a_dispatcher: 0,
  chez_le_bailleur: 1,
  en_cours: 2,
  en_retard: 2,
  a_confirmer: 3,
  terminees: 4,
};

/** La frise d'une demande, lue sur sa file ; `null` pour une demande annulée (la frise dit l'annulation). */
export function etapesDeLaFrise(r: Pick<InterventionEnFile, 'file' | 'status' | 'quote_submitted_at'>): readonly EtapeDeLaFrise[] | null {
  if (r.status === 'cancelled') return null;
  const rang = r.file ? (RANG_DE_LA_FILE[r.file] ?? 0) : 0;
  const terminee = r.file === 'terminees';
  return ETAPES_DE_LA_FRISE.map((cle, i) => {
    if (terminee || i < rang) {
      return { cle, etat: cle === 'chez_le_bailleur' && !r.quote_submitted_at ? 'sautee' : 'faite' };
    }
    if (i === rang) return { cle, etat: 'courante', ...(r.file === 'en_retard' ? { enRetard: true } : {}) };
    return { cle, etat: 'a_venir' };
  });
}
