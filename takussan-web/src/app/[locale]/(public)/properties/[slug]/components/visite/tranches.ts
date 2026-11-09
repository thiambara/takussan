import { decalerJour } from '@/lib/jour-de-l-api';
import { heureMuraleADakar, instantADakar } from '@/lib/visites/heure-de-dakar';
import type { VisitWindow } from '@/types/visit';

/**
 * TCK-2503 — le « quand » d'une demande de visite : un jour et une tranche de la journée, jugés à
 * DAKAR comme l'API les juge (TCK-2502, `TrancheDeVisite` et `VisitWindow::startOn`).
 *
 * Le début d'une tranche ne sert qu'à savoir si elle est déjà ENTAMÉE (l'API refuse alors la
 * demande, `visits.window_started`). Il ne s'affiche jamais comme une heure : c'est l'agent qui
 * fixe l'heure en confirmant.
 */
export const TRANCHES: readonly VisitWindow[] = ['morning', 'afternoon', 'evening'];

/** Le début de chaque tranche, heure de Dakar — miroir de `VisitWindow::startTime()`. */
const DEBUT_DE_TRANCHE: Record<VisitWindow, string> = {
  morning: '09:00',
  afternoon: '14:00',
  evening: '17:00',
};

/** `TrancheDeVisite::MAX_DAYS` : aujourd'hui inclus, J+30 inclus, J+31 refusé. */
export const JOURS_OUVERTS = 30;

/** Le jour de Dakar (`AAAA-MM-JJ`) à l'instant donné. */
export function aujourdhuiADakar(maintenant: Date = new Date()): string {
  return heureMuraleADakar(maintenant).slice(0, 10);
}

/** Vrai dès que le début de la tranche, ce jour-là à Dakar, est atteint (l'API : `! isFuture()`). */
export function trancheEntamee(jour: string, tranche: VisitWindow, maintenant: Date = new Date()): boolean {
  return Date.parse(instantADakar(jour, DEBUT_DE_TRANCHE[tranche])) <= maintenant.getTime();
}

export function tranchesOuvertes(jour: string, maintenant: Date = new Date()): VisitWindow[] {
  return TRANCHES.filter((t) => !trancheEntamee(jour, t, maintenant));
}

/** Le premier jour où une tranche reste demandable : aujourd'hui, ou demain après 17:00. */
function premierJourOuvert(maintenant: Date): string {
  const aujourdhui = aujourdhuiADakar(maintenant);
  return tranchesOuvertes(aujourdhui, maintenant).length > 0 ? aujourdhui : decalerJour(aujourdhui, 1);
}

/** Les jours proposés d'un geste — les suivants passent par le calendrier. */
export function joursProposes(maintenant: Date = new Date(), nombre = 3): string[] {
  const premier = premierJourOuvert(maintenant);
  return Array.from({ length: nombre }, (_, i) => decalerJour(premier, i));
}

/** Les bornes du calendrier « Autre date », incluses. */
export function bornesDuCalendrier(maintenant: Date = new Date()): { premier: string; dernier: string } {
  return {
    premier: premierJourOuvert(maintenant),
    dernier: decalerJour(aujourdhuiADakar(maintenant), JOURS_OUVERTS),
  };
}

/** Ce qui part : le jour et la tranche, JAMAIS d'heure (l'API refuse les deux ensemble). */
export function chargeDeLaDemande(jour: string, tranche: VisitWindow): { date: string; preferred_window: VisitWindow } {
  return { date: jour, preferred_window: tranche };
}
