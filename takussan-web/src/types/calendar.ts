/**
 * TCK-072 — Calendrier agrégé agent/owner.
 *
 * `CalendarEvent` reflète la forme retournée par `GET /api/calendar`
 * (voir `App\Http\Controllers\Api\CalendarController`). Un événement
 * peut être une réservation courte durée (plage jour/jour, `all_day:
 * true`), une visite (ponctuelle, `all_day: false`) ou une période de bail
 * quand l'agrégateur expose ce type.
 */

/**
 * TCK-591 — `task` (tâches personnelles, à leur échéance), `lease_event` (fin et renouvellement de
 * bail, journée entière) et `maintenance` (interventions planifiées). `lease` reste lu : c'est la
 * forme qu'exposait l'ancien calendrier.
 */
export type CalendarEventType = 'booking' | 'visit' | 'lease' | 'task' | 'lease_event' | 'maintenance';

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
  /** `lease_event` : `end` (fin de bail) ou `renewal` (renouvellement) ; `visit` : `window` (demandée par tranche). */
  kind?: 'end' | 'renewal' | 'window' | null;
  /** TCK-2585 — visite, pour le personnel de l'agence du bien seulement : le visiteur et l'adresse. */
  visitor_name?: string | null;
  address_line?: string | null;
  /** TCK-2886 — séjour : aussi le quartier du bien, à tout lecteur de l'événement. */
  neighborhood?: string | null;
  /** TCK-2886 — séjour, pour le super-admin et le personnel de l'agence du bien seulement : le client. */
  customer_name?: string | null;
  /** TCK-2886 — visite : son rang parmi les visites non annulées du même client sur le bien ; nul sans client. */
  visit_rank?: number | null;
  /** Visite demandée par tranche (`morning`…) : journée entière, la tranche dans le titre. */
  preferred_window?: string | null;
  /** Tâche : ce à quoi elle est rattachée. */
  taskable_type?: 'customer' | 'property' | null;
  taskable_id?: number | null;
  /** TCK-617 — tâche dont le parent (bien, client) est supprimé : gardée à l'agenda, marquée. */
  parent_deleted?: boolean;
  /** Deeplink vers la page détail (`/app/bookings/{id}` ou `/app/visits/{id}`). */
  resource_url: string;
}

export interface CalendarResponse {
  data: CalendarEvent[];
}

export type CalendarView = 'month' | 'week' | 'day' | 'list';
