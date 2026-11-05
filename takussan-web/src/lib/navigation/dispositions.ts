import type { IdDestination } from './catalogue';
import type { Persona } from './personas';
import type { NavSection } from './types';

/**
 * TCK-2477 (ADR-0089 §3) — la disposition du menu, par persona.
 *
 * ⚠ **Ce lot les écrit en MIROIR du menu de `dev` (0b7deae44)** : chaque persona place les 29
 * destinations, dans l'ordre que `buildNavItems` produisait pour son rôle — l'accès, lui, filtre.
 * TCK-2478 les fait diverger (dispositions validées par le porteur le 2026-11-05).
 *
 * `Record<Persona, …>` est EXHAUSTIF : un persona ajouté sans disposition casse `tsc`.
 */
export interface GroupeDeDisposition {
  readonly id: NavSection;
  readonly entrees: readonly IdDestination[];
}

export interface Disposition {
  readonly groupes: readonly GroupeDeDisposition[];
}

/** TCK-646 — la tête, dans l'ordre du porteur : accueil, biens, publier, messagerie, réservations, visites, crédits. */
const TETE: readonly IdDestination[] = [
  'tableau-de-bord',
  'mes-biens',
  'publier-bien',
  'proposer-bien',
  'publier-annonce',
  'messagerie',
  'reservations',
  'visites',
  'credits',
];
const DECOUVRIR: readonly IdDestination[] = ['favoris', 'recherches'];
const DEMANDES: readonly IdDestination[] = ['maintenance', 'carnet-prestataires', 'demandes'];
const ENGAGEMENTS_PERSONNEL: readonly IdDestination[] = [
  'baux',
  'paiements',
  'avis',
  'commissions',
  'documents',
  'etats-des-lieux',
  'entrees-en-attente',
];
/** TCK-173 — le parcours du client : bail, paiements, états des lieux, ses avis, puis ses documents. */
const ENGAGEMENTS_CLIENT: readonly IdDestination[] = [
  'baux',
  'paiements',
  'etats-des-lieux',
  'avis',
  'documents',
  'commissions',
  'entrees-en-attente',
];
const PILOTAGE: readonly IdDestination[] = [
  'statistiques',
  'exports',
  'vue-agence',
  'kpis',
  'alertes',
  'proprietaires',
  'clients',
  'calendrier',
];

function miroir(engagements: readonly IdDestination[]): Disposition {
  return {
    groupes: [
      { id: 'primary', entrees: TETE },
      { id: 'discover', entrees: DECOUVRIR },
      { id: 'requests', entrees: DEMANDES },
      { id: 'engagements', entrees: engagements },
      { id: 'manage', entrees: PILOTAGE },
    ],
  };
}

const MIROIR_PERSONNEL = miroir(ENGAGEMENTS_PERSONNEL);
const MIROIR_CLIENT = miroir(ENGAGEMENTS_CLIENT);

export const DISPOSITIONS: Record<Persona, Disposition> = {
  client: MIROIR_CLIENT,
  locataire: MIROIR_CLIENT,
  bailleur: MIROIR_PERSONNEL,
  agent: MIROIR_PERSONNEL,
  'admin-agence': MIROIR_PERSONNEL,
  hote: MIROIR_PERSONNEL,
  prestataire: MIROIR_PERSONNEL,
  plateforme: MIROIR_PERSONNEL,
};
