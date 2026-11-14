import { decalerJour } from '@/lib/jour-de-l-api';
import type { CalendarEvent } from '@/types/calendar';
import { estEnAttente, jourDeLEvenement, nuitsDuSejour } from './agenda';

/**
 * TCK-2597 — « Occupation des biens » et les séjours en barres du mois : la partie PURE. Un séjour
 * occupe les NUITS de son arrivée à la veille de son départ ; une barre est un seul élément par
 * semaine traversée, jamais un morceau par jour.
 */

/** Les jours `[de, a]`, bornes comprises. */
export function joursEntre(de: string, a: string): readonly string[] {
  const jours: string[] = [];
  for (let j = de; j <= a && jours.length < 62; j = decalerJour(j, 1)) jours.push(j);
  return jours;
}

/** La première et la dernière nuit d'un séjour. */
export function nuitsOccupees(e: Pick<CalendarEvent, 'start' | 'end'>): { readonly premiere: string; readonly derniere: string } {
  const { arrivee, depart } = nuitsDuSejour(e);
  return { premiere: arrivee, derniere: decalerJour(depart, -1) };
}

export interface Segment {
  readonly evenement: CalendarEvent;
  /** Index de la première et de la dernière colonne (jours) couvertes, bornes comprises. */
  readonly debut: number;
  readonly fin: number;
  /** Le séjour commence (finit) dans cette rangée : bord arrondi de ce côté. */
  readonly commence: boolean;
  readonly finit: boolean;
  readonly piste: number;
}

/**
 * Les barres des séjours sur une rangée de jours (une semaine du mois, un mois de l'occupation) :
 * un segment par séjour qui la traverse, posé sur la première piste libre. Au-delà de `pistes`, ce
 * qui ne tient pas se compte (« +5 séjours »).
 */
export function barresDeLaRangee(sejours: readonly CalendarEvent[], jours: readonly string[], pistes = Infinity): { readonly barres: readonly Segment[]; readonly enPlus: number } {
  const premierJour = jours[0];
  const dernierJour = jours[jours.length - 1];
  if (!premierJour || !dernierJour) return { barres: [], enPlus: 0 };
  const candidats = sejours
    .filter((e) => e.type === 'booking')
    .map((e) => ({ e, ...nuitsOccupees(e) }))
    .filter(({ premiere, derniere }) => premiere <= dernierJour && derniere >= premierJour)
    .sort((a, b) => a.premiere.localeCompare(b.premiere) || b.derniere.localeCompare(a.derniere));
  const finsDesPistes: string[] = [];
  const barres: Segment[] = [];
  let enPlus = 0;
  for (const c of candidats) {
    const debutJour = c.premiere < premierJour ? premierJour : c.premiere;
    const finJour = c.derniere > dernierJour ? dernierJour : c.derniere;
    let piste = finsDesPistes.findIndex((fin) => fin < debutJour);
    if (piste < 0) piste = finsDesPistes.length;
    if (piste >= pistes) {
      enPlus += 1;
      continue;
    }
    finsDesPistes[piste] = finJour;
    barres.push({
      evenement: c.e,
      debut: jours.indexOf(debutJour),
      fin: jours.indexOf(finJour),
      commence: c.premiere >= premierJour,
      finit: c.derniere <= dernierJour,
      piste,
    });
  }
  return { barres, enPlus };
}

export interface BienOccupe {
  readonly id: number;
  readonly titre: string;
}

export interface LigneDOccupation {
  readonly bien: BienOccupe;
  readonly sejours: readonly CalendarEvent[];
  readonly echeances: readonly CalendarEvent[];
  readonly interventions: readonly CalendarEvent[];
}

/** Une ligne par bien : ses séjours, ses échéances de bail et ses interventions de la fenêtre. */
export function lignesDOccupation(biens: readonly BienOccupe[], evenements: readonly CalendarEvent[]): readonly LigneDOccupation[] {
  return biens.map((bien) => {
    const siens = evenements.filter((e) => e.property_id === bien.id);
    return {
      bien,
      sejours: siens.filter((e) => e.type === 'booking'),
      echeances: siens.filter((e) => e.type === 'lease_event'),
      interventions: siens.filter((e) => e.type === 'maintenance'),
    };
  });
}

/** Les biens que touchent les événements de la fenêtre, dans l'ordre où ils paraissent. */
export function biensDesEvenements(evenements: readonly CalendarEvent[]): readonly number[] {
  return [...new Set(evenements.flatMap((e) => (e.property_id ? [e.property_id] : [])))];
}

/** Le séjour dont `jour` est une nuit. */
export function sejourLaNuitDu(ligne: Pick<LigneDOccupation, 'sejours'>, jour: string): CalendarEvent | null {
  return (
    ligne.sejours.find((e) => {
      const { premiere, derniere } = nuitsOccupees(e);
      return premiere <= jour && jour <= derniere;
    }) ?? null
  );
}

export type EtatDuBien =
  | { readonly genre: 'occupe'; readonly jusqua: string }
  | { readonly genre: 'libreJusqua'; readonly jusqua: string }
  | { readonly genre: 'libre' };

/** L'état d'un bien vu de `jour` : « Occupé jusqu'au 24 », « Libre jusqu'au 12 », « Libre ». */
export function etatDuBien(ligne: Pick<LigneDOccupation, 'sejours'>, jour: string): EtatDuBien {
  const enCours = sejourLaNuitDu(ligne, jour);
  if (enCours) return { genre: 'occupe', jusqua: nuitsDuSejour(enCours).depart };
  const prochain = ligne.sejours
    .map((e) => nuitsOccupees(e).premiere)
    .filter((p) => p > jour)
    .sort()[0];
  return prochain ? { genre: 'libreJusqua', jusqua: prochain } : { genre: 'libre' };
}

/** « 8 séjours en cours · 2 biens libres ce soir · 2 demandes de séjour en attente ». */
export function resumeDeLOccupation(lignes: readonly LigneDOccupation[], jour: string): { readonly enCours: number; readonly libres: number; readonly enAttente: number } {
  let enCours = 0;
  let libres = 0;
  const attente = new Set<number>();
  for (const l of lignes) {
    if (sejourLaNuitDu(l, jour)) enCours += 1;
    else libres += 1;
    for (const s of l.sejours) if (estEnAttente(s) && nuitsOccupees(s).derniere >= jour) attente.add(s.id);
  }
  return { enCours, libres, enAttente: attente.size };
}

/** Le jour d'une échéance ou d'une intervention, au calendrier de Dakar. */
export const jourDe = (e: CalendarEvent) => jourDeLEvenement(e);
