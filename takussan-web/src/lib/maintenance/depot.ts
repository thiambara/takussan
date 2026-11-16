import type { FileDeLAgence } from '@/lib/maintenance/files';

/**
 * TCK-2918 (e0) — ce que devient une carte déposée sur une colonne du kanban de l'agence.
 *
 * Les colonnes sont des FILES dérivées par l'API (`MaintenanceQueue::classify()`), pas des statuts : y
 * déposer une carte n'a de sens que si un geste existant l'y mène. Un seul le fait — confier la demande
 * à un prestataire (`PATCH …` `assigned_to`, `MaintenanceRequestService::assign()`), qui la range
 * « En cours » : depuis « À dispatcher » (choisir) et depuis « En retard » (réassigner), comme le geste
 * principal de la fiche. Tout autre dépôt est REFUSÉ, sans requête : aucune transition n'est inventée.
 *
 *  · `rien` — lâchée hors d'une colonne, ou sur la sienne ;
 *  · `choisir` — ouvrir le choix du prestataire (la carte ne bouge qu'une fois l'assignation faite) ;
 *  · `refus` — dire pourquoi, et la carte revient à sa place.
 */
export type IssueDuDepot = 'rien' | 'choisir' | 'refus';

/** Les files d'où un dépôt dans « En cours » confie la demande à un prestataire. */
export const FILES_A_CONFIER: readonly FileDeLAgence[] = ['a_dispatcher', 'en_retard'];

export function issueDuDepot(source: FileDeLAgence, cible: FileDeLAgence | null): IssueDuDepot {
  if (cible === null || cible === source) return 'rien';
  if (cible === 'en_cours' && FILES_A_CONFIER.includes(source)) return 'choisir';
  return 'refus';
}
