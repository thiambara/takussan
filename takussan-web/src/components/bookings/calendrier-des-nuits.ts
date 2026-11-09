import { decalerJour } from '@/lib/jour-de-l-api';
import { isNightOccupied, isStayFree, type OccupiedRange } from '@/lib/occupancy';

/**
 * TCK-2510 — les règles du calendrier des nuits du tunnel de réservation, sans React.
 *
 * Un jour `AAAA-MM-JJ` désigne la NUIT qui commence ce jour-là (ADR-0041, `occupancy.ts`) : une
 * plage occupée `[start, end)` barre ses nuits, et son jour `end` — le départ d'un autre séjour —
 * reste libre pour une arrivée (TCK-596). Les comparaisons sont littérales, sans fuseau (ADR-0018),
 * et `aujourdhui` est le jour de l'API (`jourDeLApi()`) : c'est lui que `after_or_equal:today` juge.
 *
 * Le serveur refuse de toute façon un séjour qui chevauche une nuit prise (422
 * `booking.dates_overlap` / `booking.dates_unavailable`) : ces règles évitent la demande vouée au
 * refus, elles ne la remplacent pas.
 */
export interface SelectionDeNuits {
  readonly arrivee: string | null;
  readonly depart: string | null;
}

export interface ContexteDuCalendrier {
  readonly aujourdhui: string;
  readonly plages: readonly OccupiedRange[];
}

export const SELECTION_VIDE: SelectionDeNuits = { arrivee: null, depart: null };

/** La nuit qui commence `jour` est-elle déjà prise ? C'est ce que le calendrier barre. */
export function nuitPrise(jour: string, plages: readonly OccupiedRange[]): boolean {
  return isNightOccupied(jour, plages);
}

/** Une arrivée tombe sur une nuit libre, aujourd'hui ou plus tard. */
export function arriveePossible(jour: string, contexte: ContexteDuCalendrier): boolean {
  return jour >= contexte.aujourdhui && !nuitPrise(jour, contexte.plages);
}

/** Un départ suit l'arrivée et le séjour ne franchit aucune nuit prise — il peut tomber sur un jour barré. */
export function departPossible(arrivee: string, jour: string, plages: readonly OccupiedRange[]): boolean {
  return jour > arrivee && isStayFree(arrivee, jour, plages);
}

/** On attend le départ : une arrivée est posée, pas encore son départ. */
export function attendLeDepart(selection: SelectionDeNuits): selection is { arrivee: string; depart: null } {
  return selection.arrivee !== null && selection.depart === null;
}

/**
 * La sélection après un toucher sur `jour`.
 *
 * - En attente d'un départ, un jour plus tard devient le départ s'il garde le séjour libre ; sinon
 *   rien ne change (comme les calendriers de location : au-delà de la première nuit prise, les jours
 *   sont éteints jusqu'à « Effacer » ou un jour plus tôt).
 * - Sinon, un jour où l'on peut arriver recommence la sélection à partir de lui.
 * - Sinon, rien ne change : un séjour qui chevaucherait une nuit prise est IMPOSSIBLE au calendrier.
 */
export function choisirJour(
  selection: SelectionDeNuits,
  jour: string,
  contexte: ContexteDuCalendrier,
): SelectionDeNuits {
  if (attendLeDepart(selection) && jour > selection.arrivee) {
    return departPossible(selection.arrivee, jour, contexte.plages) ? { arrivee: selection.arrivee, depart: jour } : selection;
  }
  if (arriveePossible(jour, contexte)) return { arrivee: jour, depart: null };
  return selection;
}

/** Le toucher sur `jour` change-t-il quelque chose ? Sinon le jour n'est pas sélectionnable. */
export function jourSelectionnable(
  selection: SelectionDeNuits,
  jour: string,
  contexte: ContexteDuCalendrier,
): boolean {
  if (attendLeDepart(selection) && jour > selection.arrivee) return departPossible(selection.arrivee, jour, contexte.plages);
  return arriveePossible(jour, contexte);
}

/** Une sélection complète, dans l'avenir, sans nuit prise. */
export function selectionComplete(
  selection: SelectionDeNuits,
  contexte: ContexteDuCalendrier,
): selection is { arrivee: string; depart: string } {
  return (
    selection.arrivee !== null &&
    selection.depart !== null &&
    selection.arrivee >= contexte.aujourdhui &&
    departPossible(selection.arrivee, selection.depart, contexte.plages)
  );
}

/**
 * Ce qui reste d'une sélection une fois les nuits prises connues (elles arrivent après le premier
 * rendu, et des dates rapportées par l'URL peuvent être devenues prises entre-temps) : un départ
 * qui franchirait une nuit prise tombe, une arrivée devenue impossible aussi.
 */
export function selectionTenable(selection: SelectionDeNuits, contexte: ContexteDuCalendrier): SelectionDeNuits {
  // Rien de choisi : rien à faire tomber. Rendre la même référence, sinon l'appelant (qui compare
  // par identité) annoncerait « ces dates ne sont plus libres » à qui n'en a choisi aucune.
  if (selection.arrivee === null) return selection.depart === null ? selection : SELECTION_VIDE;
  if (!arriveePossible(selection.arrivee, contexte)) return SELECTION_VIDE;
  if (selection.depart !== null && !departPossible(selection.arrivee, selection.depart, contexte.plages)) {
    return { arrivee: selection.arrivee, depart: null };
  }
  return selection;
}

/** Le nombre de nuits entre deux jours `AAAA-MM-JJ` (0 si le départ ne suit pas l'arrivée). */
export function nombreDeNuits(arrivee: string | null, depart: string | null): number {
  if (arrivee === null || depart === null) return 0;
  const diff = Math.round((Date.parse(`${depart}T00:00:00Z`) - Date.parse(`${arrivee}T00:00:00Z`)) / 86_400_000);
  return Number.isFinite(diff) ? Math.max(0, diff) : 0;
}

/** Le jour est-il strictement entre l'arrivée et le départ ? (le fond de la plage choisie) */
export function dansLeSejour(jour: string, selection: SelectionDeNuits): boolean {
  return selection.arrivee !== null && selection.depart !== null && jour > selection.arrivee && jour < selection.depart;
}

export interface MoisDuCalendrier {
  /** `AAAA-MM` */
  readonly cle: string;
  /** Le premier jour du mois, `AAAA-MM-01` — pour en formater le nom. */
  readonly premier: string;
  /** Les cases de la grille, du lundi au dimanche : `null` avant le 1er. */
  readonly cases: readonly (string | null)[];
}

/** Le mois qui contient `jour`, décalé de `decalage` mois. */
export function moisDecale(jour: string, decalage: number): string {
  const [a, m] = jour.split('-').map((x) => Number.parseInt(x, 10));
  return new Date(Date.UTC(a, m - 1 + decalage, 1)).toISOString().slice(0, 10);
}

/** La grille d'un mois, semaines commençant le lundi (usage du Sénégal et de la France). */
export function grilleDuMois(premierDuMois: string): MoisDuCalendrier {
  const [a, m] = premierDuMois.split('-').map((x) => Number.parseInt(x, 10));
  const premier = new Date(Date.UTC(a, m - 1, 1));
  const jours = new Date(Date.UTC(a, m, 0)).getUTCDate();
  // getUTCDay : 0 = dimanche → 6 cases vides ; 1 = lundi → 0.
  const vides = (premier.getUTCDay() + 6) % 7;
  const debut = premier.toISOString().slice(0, 10);
  const cases: (string | null)[] = Array.from({ length: vides }, () => null);
  for (let i = 0; i < jours; i += 1) cases.push(decalerJour(debut, i));
  return { cle: debut.slice(0, 7), premier: debut, cases };
}

/** `nombre` mois consécutifs à partir de celui qui contient `jour`. */
export function moisAPartirDe(jour: string, nombre: number): readonly MoisDuCalendrier[] {
  return Array.from({ length: nombre }, (_, i) => grilleDuMois(moisDecale(jour, i)));
}
