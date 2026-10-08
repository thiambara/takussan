/**
 * TCK-596 §3B (ADR-0041) — des nuits occupées, en plages semi-ouvertes `[start, end)` de dates
 * `YYYY-MM-DD` : `end` est le jour de DÉPART, libre pour une arrivée. Même règle que l'API
 * (`PropertyAvailabilityService`), comparée lexicalement, sans fuseau.
 */
export interface OccupiedRange {
  readonly start: string;
  readonly end: string;
}

/** La nuit qui commence `day` est-elle prise ? */
export function isNightOccupied(day: string, ranges: readonly OccupiedRange[]): boolean {
  return ranges.some((r) => r.start <= day && day < r.end);
}

/** Un séjour `[start, end)` est-il entièrement libre ? */
export function isStayFree(start: string, end: string, ranges: readonly OccupiedRange[]): boolean {
  if (end <= start) return false;
  return !ranges.some((r) => r.start < end && r.end > start);
}
