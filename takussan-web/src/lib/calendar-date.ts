/**
 * TCK-072 — Date helpers pour la vue calendrier agrégée.
 *
 * On reste dépendance-zéro (pas de `date-fns` dans le projet). Les
 * fonctions sont intentionnellement naïves par rapport au fuseau horaire :
 * elles travaillent en heure locale de la machine (cohérent avec le
 * fuseau projet `Africa/Dakar`, qui n'a ni DST ni offset changeant).
 *
 * Conventions :
 * - Semaine commence le lundi (Sénégal / i18n fr-SN).
 * - `startOfMonthGrid` renvoie le lundi de la semaine qui contient le
 *   premier jour du mois, pour produire une grille 6×7 régulière.
 */

export type DayRange = { start: Date; end: Date };

/** Clone a date sans muter l'original. */
export function cloneDate(d: Date): Date {
  return new Date(d.getTime());
}

export function startOfDay(d: Date): Date {
  const x = cloneDate(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = cloneDate(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function addDays(d: Date, days: number): Date {
  const x = cloneDate(d);
  x.setDate(x.getDate() + days);
  return x;
}

export function addMonths(d: Date, months: number): Date {
  const x = cloneDate(d);
  // Use setMonth directly; JS normalizes overflow (eg. jan 31 + 1 → mar 3).
  // Snap to the 1st of the target month to avoid that.
  x.setDate(1);
  x.setMonth(x.getMonth() + months);
  return x;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Lundi = 1, Dimanche = 0 ; on normalise à lundi-first (0..6, Lun=0). */
export function mondayFirstIndex(d: Date): number {
  const day = d.getDay();
  return (day + 6) % 7;
}

/** Lundi de la semaine ISO qui contient `d`, 00:00. */
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() - mondayFirstIndex(x));
  return x;
}

export function endOfWeek(d: Date): Date {
  return endOfDay(addDays(startOfWeek(d), 6));
}

export function startOfMonth(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

export function endOfMonth(d: Date): Date {
  const x = startOfMonth(d);
  x.setMonth(x.getMonth() + 1);
  x.setDate(0); // last day of previous (= target) month
  return endOfDay(x);
}

/**
 * Grille mois 6×7 : lundi de la semaine qui contient le 1er du mois →
 * dimanche de la semaine qui contient le dernier jour du mois, étendue
 * à 42 jours (6 semaines) pour une hauteur constante.
 */
export function monthGrid(d: Date): Date[] {
  const first = startOfMonth(d);
  const gridStart = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

export function weekDays(d: Date): Date[] {
  const start = startOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/**
 * Intervalle `from`/`to` (bornes jour) pour une vue donnée.
 * On élargit la vue mois à la grille complète (pour récupérer les events
 * qui débordent sur les jours du mois voisin).
 */
export function visibleRange(view: 'month' | 'week' | 'day' | 'list', focus: Date): DayRange {
  switch (view) {
    case 'month': {
      const grid = monthGrid(focus);
      return { start: startOfDay(grid[0]), end: endOfDay(grid[grid.length - 1]) };
    }
    case 'week':
      return { start: startOfWeek(focus), end: endOfWeek(focus) };
    case 'day':
      return { start: startOfDay(focus), end: endOfDay(focus) };
    case 'list':
      // List = 30 jours glissants à partir de focus
      return { start: startOfDay(focus), end: endOfDay(addDays(focus, 29)) };
  }
}

/** Format `YYYY-MM-DD` (pas d'Intl — les query params n'ont pas besoin d'i18n). */
export function formatISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse `YYYY-MM-DD[ HH:mm:ss]` → Date locale (évite `new Date('YYYY-MM-DD')` = UTC). */
export function parseServerDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const iso = value.includes('T') ? value : value.replace(' ', 'T');
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Teste si l'événement (dont `start`/`end` sont des Date) touche le jour
 * `day` (inclusif des deux côtés pour les bookings plurijournaliers).
 */
export function eventTouchesDay(
  event: { start: Date; end: Date | null },
  day: Date,
): boolean {
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  const start = event.start;
  const end = event.end ?? event.start;
  return start <= dayEnd && end >= dayStart;
}

/**
 * En-têtes de colonnes des grilles mois et semaine, **du lundi au dimanche**.
 *
 * TCK-292 — la donnée transporte la CLÉ, le rendu la résout (patron posé par
 * TCK-286). Ce tableau s'appelait `WEEKDAY_SHORT_FR` et portait
 * `['Lun', 'Mar', …]` en dur : un anglophone sur `/app/calendar` lisait
 * « Lun Mar Mer… » sur les deux vues, sans qu'aucune garde ne puisse le voir
 * — ce n'étaient pas des littéraux de `MonthView`/`WeekView`, mais d'un module
 * `lib/` qu'aucun scan de composant n'inspecte.
 *
 * Les libellés vivent désormais sous `calendar.weekdaysShort.*` dans les trois
 * dictionnaires. L'ordre est significatif : `mondayFirstIndex()` indexe ici.
 */
export const WEEKDAY_SHORT_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export type WeekdayKey = (typeof WEEKDAY_SHORT_KEYS)[number];
