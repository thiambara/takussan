import { decalerJour } from '@/lib/jour-de-l-api';
import { instantDeLEvenement, rangDansLaSemaine, semaineDe } from '@/lib/journee/journee';
import { heureMuraleADakar } from '@/lib/visites/heure-de-dakar';
import type { CalendarEvent, CalendarEventType, CalendarView } from '@/types/calendar';

/**
 * TCK-2597 — l'agenda (maquette `app-agenda` a) : la partie PURE. Deux vues d'une même page :
 * « Mon agenda » porte ce qui a une heure et une personne (visites, tâches), « Occupation des biens »
 * ce qui dure et tient à un bien (séjours, échéances de bail, interventions) — les séjours de
 * plusieurs semaines ne noient plus la seule visite de la journée (décision 8 de l'audit).
 *
 * Les jours sont des chaînes `AAAA-MM-JJ` du calendrier de Dakar, les heures des minutes de l'heure
 * murale de Dakar : jamais le fuseau du navigateur.
 */

/** Qui regarde : décidé par la page serveur depuis les rôles. */
export type PersonaDeLAgenda = 'agent' | 'admin' | 'bailleur' | 'prestataire';

export type ModeDeLAgenda = 'agenda' | 'occupation';

/** L'ordre de la légende et des filtres : Séjour, Visite, Tâche, Échéance, Intervention. */
export const TYPES_DE_L_AGENDA: readonly CalendarEventType[] = ['booking', 'visit', 'task', 'lease_event', 'maintenance'];

/** Ce que demande « Occupation » : ce qui tient à un bien. */
export const TYPES_DE_L_OCCUPATION: readonly CalendarEventType[] = ['booking', 'lease_event', 'maintenance'];

/** Le prestataire n'a aucun bien : ses interventions, seules, et pas d'« Occupation ». */
export function modesDisponibles(persona: PersonaDeLAgenda): readonly ModeDeLAgenda[] {
  return persona === 'prestataire' ? ['agenda'] : ['agenda', 'occupation'];
}

/** Les types qu'une bascule peut allumer dans ce mode. */
export function typesDisponibles(persona: PersonaDeLAgenda, mode: ModeDeLAgenda): readonly CalendarEventType[] {
  if (persona === 'prestataire') return ['maintenance'];
  return mode === 'occupation' ? TYPES_DE_L_OCCUPATION : TYPES_DE_L_AGENDA;
}

/**
 * Les types allumés à l'ouverture. L'agent : ses visites et ses tâches, sans les séjours. L'admin et
 * le bailleur gardent les cinq — les séjours restent visibles, repliés en fin de journée.
 */
export function typesParDefaut(persona: PersonaDeLAgenda, mode: ModeDeLAgenda): readonly CalendarEventType[] {
  if (persona === 'agent' && mode === 'agenda') return ['visit', 'task'];
  return typesDisponibles(persona, mode);
}

/**
 * La vue d'ouverture, quand l'URL n'en porte pas : l'agent ouvre sa journée au téléphone et sa
 * semaine au bureau ; l'admin, le bailleur et le prestataire ouvrent le mois.
 */
export function vueParDefaut(persona: PersonaDeLAgenda, bureau: boolean): CalendarView {
  if (persona === 'agent') return bureau ? 'week' : 'day';
  return 'month';
}

/** Les types d'une URL (`types=visit,task`), bornés à ce que le mode offre ; vide : le défaut. */
export function typesDeLUrl(brut: string | null, persona: PersonaDeLAgenda, mode: ModeDeLAgenda): readonly CalendarEventType[] {
  const offerts = typesDisponibles(persona, mode);
  const lus = new Set((brut ?? '').split(','));
  const types = offerts.filter((t) => lus.has(t));
  return types.length > 0 ? types : typesParDefaut(persona, mode);
}

/**
 * Basculer un type : jamais tous éteints. Rend la valeur à écrire dans l'URL — `null` quand la
 * sélection est celle de l'ouverture.
 */
export function basculerType(
  selection: readonly CalendarEventType[],
  type: CalendarEventType,
  persona: PersonaDeLAgenda,
  mode: ModeDeLAgenda,
): string | null | undefined {
  const allume = selection.includes(type);
  if (allume && selection.length === 1) return undefined;
  const suivants = typesDisponibles(persona, mode).filter((t) => (t === type ? !allume : selection.includes(t)));
  const defaut = typesParDefaut(persona, mode);
  return suivants.length === defaut.length && suivants.every((t) => defaut.includes(t)) ? null : suivants.join(',');
}

/* ─────────────────────────────── heures de Dakar ─────────────────────────────── */

/** Le jour de Dakar d'un événement : une journée entière porte son jour tel quel. */
export function jourDeLEvenement(e: Pick<CalendarEvent, 'start' | 'all_day'>): string {
  return e.all_day ? e.start.slice(0, 10) : heureMuraleADakar(instantDeLEvenement(e.start)).slice(0, 10);
}

/** Les minutes de l'heure murale de Dakar (0 → 1439) d'un instant de l'API. */
export function minutesADakar(debut: string): number {
  const murale = heureMuraleADakar(instantDeLEvenement(debut));
  return Number(murale.slice(11, 13)) * 60 + Number(murale.slice(14, 16));
}

/** `HH:MM` de minutes. */
export function heureDeMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

const QUART = 15;
const arrondiAuQuart = (m: number) => Math.ceil(m / QUART) * QUART;

/** Est-ce une journée entière (réservation, échéance, visite demandée par tranche) ? */
export const estSansHeure = (e: Pick<CalendarEvent, 'all_day' | 'start'>) => e.all_day || !e.start;

/** Les jours (`AAAA-MM-JJ`) qu'un séjour occupe dans `[premier, dernier]` : de l'arrivée à la veille du départ. */
export function nuitsDuSejour(e: Pick<CalendarEvent, 'start' | 'end'>): { readonly arrivee: string; readonly depart: string } {
  const arrivee = e.start.slice(0, 10);
  const depart = (e.end ?? e.start).slice(0, 10);
  return { arrivee, depart: depart > arrivee ? depart : decalerJour(arrivee, 1) };
}

/* ─────────────────────────────── la journée ─────────────────────────────── */

export interface Minute {
  readonly evenement: CalendarEvent;
  readonly debut: number;
  readonly fin: number;
}

export interface Libre {
  readonly de: number;
  readonly a: number;
}

export interface JourneeDeLAgenda {
  /** Échéances, tâches sans heure, visites demandées par tranche : en tête du jour. */
  readonly sansHeure: readonly CalendarEvent[];
  /** Ce qui a une heure, dans l'ordre, entrecoupé du temps libre d'au moins une heure. */
  readonly lignes: readonly ({ readonly genre: 'evenement'; readonly m: Minute } | { readonly genre: 'libre'; readonly libre: Libre })[];
  /** Les séjours en cours ce jour-là : repliés en fin de journée, jamais dans la liste. */
  readonly sejours: readonly CalendarEvent[];
}

const DUREE_PAR_DEFAUT = 30;

function minuteDe(e: CalendarEvent): Minute {
  const debut = minutesADakar(e.start);
  const finLue = e.end && e.end !== e.start && jourDeLEvenement({ start: e.end, all_day: false }) === jourDeLEvenement(e) ? minutesADakar(e.end) : null;
  const fin = finLue !== null && finLue > debut ? finLue : Math.min(24 * 60, debut + (e.duration_minutes && e.duration_minutes > 0 ? e.duration_minutes : DUREE_PAR_DEFAUT));
  return { evenement: e, debut, fin };
}

/** Un séjour touche-t-il `jour` (de l'arrivée au départ inclus) ? */
export function sejourTouche(e: CalendarEvent, jour: string): boolean {
  const { arrivee, depart } = nuitsDuSejour(e);
  return arrivee <= jour && jour <= depart;
}

/**
 * La journée de l'agenda : les séjours à part, les journées entières en tête, puis ce qui a une
 * heure — et, entre deux rendez-vous, le temps libre d'au moins une heure (« Libre de 11:30 à
 * 16:55 »), qui s'ouvre sur « Planifier une visite ».
 */
export function journeeDeLAgenda(evenements: readonly CalendarEvent[], jour: string): JourneeDeLAgenda {
  const sejours = evenements.filter((e) => e.type === 'booking' && sejourTouche(e, jour));
  const duJour = evenements.filter((e) => e.type !== 'booking' && e.start && jourDeLEvenement(e) === jour);
  const sansHeure = duJour.filter(estSansHeure);
  const minutes = duJour
    .filter((e) => !estSansHeure(e))
    .map(minuteDe)
    .sort((a, b) => a.debut - b.debut || a.fin - b.fin);
  const lignes: JourneeDeLAgenda['lignes'][number][] = [];
  let finJusquIci = -1;
  for (const m of minutes) {
    if (finJusquIci >= 0) {
      const de = arrondiAuQuart(finJusquIci);
      if (m.debut - de >= 60) lignes.push({ genre: 'libre', libre: { de, a: m.debut } });
    }
    lignes.push({ genre: 'evenement', m });
    finJusquIci = Math.max(finJusquIci, m.fin);
  }
  return { sansHeure, lignes, sejours };
}

/** Les séjours d'un jour : en cours ce soir, arrivées et départs. */
export function occupationDuJour(sejours: readonly CalendarEvent[], jour: string): { readonly enCours: number; readonly arrivees: number; readonly departs: number } {
  let enCours = 0;
  let arrivees = 0;
  let departs = 0;
  for (const e of sejours) {
    if (e.type !== 'booking') continue;
    const { arrivee, depart } = nuitsDuSejour(e);
    if (arrivee <= jour && jour < depart) enCours += 1;
    if (arrivee === jour) arrivees += 1;
    if (depart === jour) departs += 1;
  }
  return { enCours, arrivees, departs };
}

/* ─────────────────────────────── la semaine ─────────────────────────────── */

export interface Bloc extends Minute {
  readonly jour: string;
  /** La piste du bloc parmi ceux qui se chevauchent, et leur nombre. */
  readonly piste: number;
  readonly pistes: number;
}

export interface SemaineDeLAgenda {
  readonly jours: readonly string[];
  readonly blocs: readonly Bloc[];
  readonly sansHeure: Readonly<Record<string, readonly CalendarEvent[]>>;
  /** La plage affichée, en heures : 8 h → 20 h, élargie à ce qui en sort (une intervention à 06:41). */
  readonly de: number;
  readonly a: number;
}

export const PREMIERE_HEURE = 8;
export const DERNIERE_HEURE = 20;

/** Les pistes d'un jour : chaque grappe de blocs qui se chevauchent se partage la largeur. */
function pistesDuJour(minutes: readonly Minute[], jour: string): Bloc[] {
  const tries = [...minutes].sort((a, b) => a.debut - b.debut || a.fin - b.fin);
  const blocs: Bloc[] = [];
  let grappe: { m: Minute; piste: number }[] = [];
  let finDeGrappe = -1;
  const fermer = () => {
    const pistes = grappe.reduce((n, g) => Math.max(n, g.piste + 1), 0);
    for (const g of grappe) blocs.push({ ...g.m, jour, piste: g.piste, pistes });
    grappe = [];
  };
  for (const m of tries) {
    if (grappe.length > 0 && m.debut >= finDeGrappe) fermer();
    const fins: number[] = [];
    for (const g of grappe) fins[g.piste] = Math.max(fins[g.piste] ?? -1, g.m.fin);
    let piste = fins.findIndex((f) => f !== undefined && f <= m.debut);
    if (piste < 0) piste = fins.length;
    grappe.push({ m, piste });
    finDeGrappe = Math.max(finDeGrappe, m.fin);
  }
  if (grappe.length > 0) fermer();
  return blocs;
}

/** La semaine (lundi → dimanche) de `jour` : blocs posés à l'heure de Dakar, journées entières à part. */
export function semaineDeLAgenda(evenements: readonly CalendarEvent[], jour: string): SemaineDeLAgenda {
  const jours = semaineDe(jour);
  const sansHeure: Record<string, CalendarEvent[]> = Object.fromEntries(jours.map((j) => [j, []]));
  const parJour: Record<string, Minute[]> = Object.fromEntries(jours.map((j) => [j, []]));
  for (const e of evenements) {
    if (!e.start) continue;
    if (e.type === 'booking') {
      for (const j of jours) if (sejourTouche(e, j)) sansHeure[j]!.push(e);
      continue;
    }
    const j = jourDeLEvenement(e);
    if (!(j in parJour)) continue;
    if (estSansHeure(e)) sansHeure[j]!.push(e);
    else parJour[j]!.push(minuteDe(e));
  }
  const blocs = jours.flatMap((j) => pistesDuJour(parJour[j]!, j));
  const de = Math.min(PREMIERE_HEURE, ...blocs.map((b) => Math.floor(b.debut / 60)));
  const a = Math.min(24, Math.max(DERNIERE_HEURE, ...blocs.map((b) => Math.ceil(b.fin / 60))));
  return { jours, blocs, sansHeure, de, a };
}

/* ─────────────────────────────── résumés ─────────────────────────────── */

const ATTENTE = new Set(['pending', 'scheduled', 'pending_signature']);

/** En attente de confirmation (visite proposée, séjour demandé, bail à signer) : le gris hachuré. */
export const estEnAttente = (e: Pick<CalendarEvent, 'status'>) => ATTENTE.has(e.status);

export interface ResumeDeLaPeriode {
  readonly visites: number;
  readonly aConfirmer: number;
  readonly taches: number;
}

/** « 7 visites, dont 3 à confirmer · 3 tâches » : ce que compte la tête de page. */
export function resumeDeLaPeriode(evenements: readonly CalendarEvent[]): ResumeDeLaPeriode {
  let visites = 0;
  let aConfirmer = 0;
  let taches = 0;
  for (const e of evenements) {
    if (e.type === 'visit') {
      visites += 1;
      if (estEnAttente(e)) aConfirmer += 1;
    } else if (e.type === 'task') taches += 1;
  }
  return { visites, aConfirmer, taches };
}

/** Les points d'un jour dans la bande de la semaine : un par événement, trois au plus, séjours exclus. */
export function pointsDuJour(evenements: readonly CalendarEvent[], jour: string): readonly CalendarEventType[] {
  return evenements
    .filter((e) => e.type !== 'booking' && e.start && jourDeLEvenement(e) === jour)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((e) => e.type)
    .slice(0, 3);
}

/** Le lundi de la semaine de `jour` : la fenêtre que lit la vue Jour (la bande porte la semaine). */
export function lundiDe(jour: string): string {
  return decalerJour(jour, -rangDansLaSemaine(jour));
}
