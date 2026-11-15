import { decalerJour } from '@/lib/jour-de-l-api';
import { instantADakar } from '@/lib/visites/heure-de-dakar';
import { jourADakar } from '@/lib/visites/par-le-temps';
import type { AgentTask } from '@/types/agent-crm';
import type { CalendarEvent } from '@/types/calendar';
import type { PropertyVisit } from '@/types/visit';

/**
 * TCK-2596 — « Ma journée », l'accueil de l'agent (maquette `app-aujourdhui` a, ADR-0096) : la partie
 * PURE. Les jours sont des chaînes `AAAA-MM-JJ` du calendrier de Dakar ; l'instant d'un geste
 * (« Reporter · Demain ») se construit à Dakar, jamais dans le fuseau du navigateur.
 */

export { jourADakar };

/** Le jour de la semaine de `jour`, 0 = lundi … 6 = dimanche. */
export function rangDansLaSemaine(jour: string): number {
  const [a, m, j] = jour.split('-').map((x) => Number.parseInt(x, 10));
  return (new Date(Date.UTC(a, m - 1, j)).getUTCDay() + 6) % 7;
}

/** Les sept jours (lundi → dimanche) de la semaine de `jour`. */
export function semaineDe(jour: string): readonly string[] {
  const lundi = decalerJour(jour, -rangDansLaSemaine(jour));
  return Array.from({ length: 7 }, (_, i) => decalerJour(lundi, i));
}

/** L'heure d'un report : 09:00 à Dakar. */
export const HEURE_DE_REPORT = '09:00';

export type Report = 'demain' | 'lundi' | 'semaine';

/**
 * L'échéance d'un report, à 09:00 à Dakar : le lendemain, le lundi qui vient (jamais aujourd'hui :
 * un lundi reporte au lundi suivant), ou dans sept jours.
 */
export function echeanceDuReport(report: Report, maintenant: Date): string {
  const aujourdhui = jourADakar(maintenant);
  const jour =
    report === 'demain'
      ? decalerJour(aujourdhui, 1)
      : report === 'semaine'
        ? decalerJour(aujourdhui, 7)
        : decalerJour(aujourdhui, 7 - rangDansLaSemaine(aujourdhui));
  return instantADakar(jour, HEURE_DE_REPORT);
}

/** La borne des demandes « qui attendent » : reçues il y a plus de 24 h. */
export function borneDAttente(maintenant: Date): string {
  return new Date(maintenant.getTime() - 24 * 3_600_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** L'instant d'un événement de `/api/calendar` (`AAAA-MM-JJ HH:MM:SS`, fuseau de l'API : UTC). */
export function instantDeLEvenement(debut: string): Date {
  return new Date(`${debut.replace(' ', 'T')}${/[zZ]|[+-]\d\d:?\d\d$/.test(debut) ? '' : 'Z'}`);
}

export interface ResumeDuJour {
  readonly visites: number;
  readonly taches: number;
}

/**
 * Une visite a sa place dans la journée : elle a une heure, elle n'est pas annulée, et ce n'est pas
 * une demande « scheduled » par tranche sans heure fixée (`preferred_window`). Faite (`completed`) ou
 * manquée (`no_show`), elle reste : elle a eu lieu ce jour-là. UNE règle pour la chronologie, le
 * sous-titre et la bande de la semaine (réserve r1 de faf3f10da).
 */
export function visiteALHeure(v: PropertyVisit): v is PropertyVisit & { scheduled_at: string } {
  return !!v.scheduled_at && v.status !== 'cancelled' && !(v.status === 'scheduled' && v.preferred_window);
}

/**
 * Ce qui se passe chaque jour de la semaine (« 2 visites · 3 tâches »), au jour de Dakar :
 *  - les visites de `/api/property-visits` (la source de la chronologie), retenues par `visiteALHeure`
 *    — jamais celles de l'agenda, qui tait les visites faites ;
 *  - les tâches de `/api/calendar?mine=1` (le reste de l'agenda est ignoré).
 */
export function resumeDeLaSemaine(
  evenements: readonly CalendarEvent[],
  visites: readonly PropertyVisit[],
  semaine: readonly string[],
): Readonly<Record<string, ResumeDuJour>> {
  const resume: Record<string, { visites: number; taches: number }> = {};
  for (const jour of semaine) resume[jour] = { visites: 0, taches: 0 };
  for (const v of visites) {
    if (!visiteALHeure(v)) continue;
    const r = resume[jourADakar(new Date(v.scheduled_at))];
    if (r) r.visites += 1;
  }
  for (const e of evenements) {
    if (!e.start || e.type !== 'task') continue;
    const r = resume[jourADakar(instantDeLEvenement(e.start))];
    if (r) r.taches += 1;
  }
  return resume;
}

/** Une tâche de la chronologie : celle de `/api/tasks` (avec son rattachement) ou de l'agenda. */
export interface TacheDuJour {
  readonly id: number;
  readonly titre: string;
  readonly echeance: string;
  readonly faite: boolean;
  readonly cible: AgentTask['taskable'];
}

export type Moment =
  | { readonly genre: 'visite'; readonly instant: number; readonly visite: PropertyVisit }
  | { readonly genre: 'tache'; readonly instant: number; readonly tache: TacheDuJour };

/**
 * La chronologie du jour : ce qui a une heure, dans l'ordre. Une visite annulée n'y est pas, ni une
 * demande sans heure fixée (une tranche, `preferred_window`) ; à heure égale, la visite d'abord.
 */
export function chronologieDuJour(visites: readonly PropertyVisit[], taches: readonly TacheDuJour[]): readonly Moment[] {
  const moments: Moment[] = [];
  for (const v of visites) {
    if (!visiteALHeure(v)) continue;
    moments.push({ genre: 'visite', instant: Date.parse(v.scheduled_at), visite: v });
  }
  for (const t of taches) moments.push({ genre: 'tache', instant: Date.parse(t.echeance), tache: t });
  return moments.sort((a, b) => a.instant - b.instant || (a.genre === b.genre ? 0 : a.genre === 'visite' ? -1 : 1));
}

/** Les tâches de `jour` parmi celles de `/api/tasks` (échues ce jour-là à Dakar). */
export function tachesDuJour(taches: readonly AgentTask[], jour: string): readonly TacheDuJour[] {
  return taches
    .filter((t) => t.due_at && t.status !== 'cancelled' && jourADakar(new Date(t.due_at)) === jour)
    .map((t) => ({ id: t.id, titre: t.title, echeance: t.due_at!, faite: t.status === 'done', cible: t.taskable }));
}

/** Les tâches de `jour` lues dans l'agenda (un autre jour qu'aujourd'hui) : le titre, sans rattachement. */
export function tachesDeLAgenda(evenements: readonly CalendarEvent[], jour: string): readonly TacheDuJour[] {
  return evenements
    .filter((e) => e.type === 'task' && e.start && jourADakar(instantDeLEvenement(e.start)) === jour)
    .map((e) => ({ id: e.id, titre: e.title, echeance: instantDeLEvenement(e.start).toISOString(), faite: e.status === 'done', cible: null }));
}

/** Les tâches en retard : ouvertes, échues avant aujourd'hui à Dakar. Les plus anciennes d'abord. */
export function tachesEnRetard(taches: readonly AgentTask[], maintenant: Date): readonly AgentTask[] {
  const aujourdhui = jourADakar(maintenant);
  return taches
    .filter((t) => t.due_at && t.status !== 'done' && t.status !== 'cancelled' && jourADakar(new Date(t.due_at)) < aujourdhui)
    .sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!));
}

/** Les jours écoulés depuis `depuis` (au jour de Dakar), au moins 1. */
export function joursDepuis(depuis: string, maintenant: Date): number {
  const a = Date.parse(`${jourADakar(new Date(depuis))}T00:00:00Z`);
  const b = Date.parse(`${jourADakar(maintenant)}T00:00:00Z`);
  return Math.max(1, Math.round((b - a) / 86_400_000));
}
