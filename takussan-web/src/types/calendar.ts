/**
 * TCK-072 — Calendrier agrégé agent/owner.
 *
 * `CalendarEvent` reflète la forme retournée par `GET /api/calendar`
 * (voir `App\Http\Controllers\Api\CalendarController`). Un événement
 * peut être une réservation courte durée (plage jour/jour, `all_day:
 * true`), une visite (ponctuelle, `all_day: false`) ou une période de bail
 * quand l'agrégateur expose ce type.
 */

export type CalendarEventType = 'booking' | 'visit' | 'lease';

/**
 * `booking` — `status` ∈ {pending, confirmed} côté back. Le front affiche
 * en gris les `pending` et en bleu les `confirmed`.
 *
 * `visit` — `status` ∈ {scheduled, confirmed} côté back. Idem : gris pour
 * les demandes, violet pour les confirmées.
 */
export type CalendarEventStatus =
  | 'pending'
  | 'confirmed'
  | 'scheduled';

export interface CalendarEvent {
  id: number;
  type: CalendarEventType;
  title: string;
  /** ISO-ish date-time (`YYYY-MM-DD HH:mm:ss`). */
  start: string;
  /** ISO-ish date-time — pour un booking, fin de séjour incluse. */
  end: string | null;
  status: CalendarEventStatus | string;
  all_day: boolean;
  reference?: string | null;
  duration_minutes?: number | null;
  property_id?: number | null;
  property_slug?: string | null;
  /** Deeplink vers la page détail (`/app/bookings/{id}` ou `/app/visits/{id}`). */
  resource_url: string;
}

export interface CalendarResponse {
  data: CalendarEvent[];
}

export type CalendarView = 'month' | 'week' | 'day' | 'list';
