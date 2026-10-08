/** TCK-596 §3B (ADR-0041) — le calendrier d'hôte d'un bien. Toutes les dates en `YYYY-MM-DD`. */

export interface PropertyUnavailability {
  readonly id: number;
  readonly property_id: number;
  readonly starts_on: string;
  /** Exclusif : le lendemain de la dernière nuit bloquée. */
  readonly ends_on: string;
  readonly reason: string | null;
  readonly source: 'manual' | 'ical';
  readonly calendar_feed_id: number | null;
  readonly feed_name?: string | null;
  /** Une réservation confirmée chevauchée par une plage importée (jamais annulée par l'import). */
  readonly conflict_booking_id: number | null;
}

export interface PropertyCalendarFeed {
  readonly id: number;
  readonly property_id: number;
  readonly url_host: string;
  readonly label: string | null;
  readonly last_synced_at: string | null;
  /** `pending` : enregistré, la première synchronisation est en file (VERIF-596 m3). */
  readonly last_status: 'pending' | 'ok' | 'failed' | null;
  readonly last_error: string | null;
  readonly failing_since: string | null;
  readonly consecutive_failures: number;
}
