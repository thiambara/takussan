import type { CompteRendu } from '@/lib/visites/compte-rendu';

export type VisitType = 'in_person' | 'virtual' | 'self_guided' | 'hybrid';

export type VisitStatus =
  | 'scheduled'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'no_show';

/**
 * TCK-2502 — la tranche de la journée demandée à la place d'une heure (`VisitWindow` de l'API) :
 * l'agent fixe l'heure en confirmant. Début à Dakar : 09:00, 14:00, 17:00 — jamais une heure promise.
 */
export type VisitWindow = 'morning' | 'afternoon' | 'evening';

/**
 * TCK-2503 — SOIT une heure (`scheduled_at`, sur la grille de Dakar), SOIT un jour et une tranche :
 * l'API refuse les deux ensemble (422).
 */
export type VisitRequestWhen =
  | { scheduled_at: string; date?: never; preferred_window?: never }
  | { date: string; preferred_window: VisitWindow; scheduled_at?: never };

export type VisitRequestPayload = VisitRequestWhen & VisitRequestDetails;

export interface VisitRequestDetails {
  type: VisitType;
  duration_minutes?: number;
  visitor_name?: string;
  visitor_email?: string;
  visitor_phone?: string;
  notes?: string;
  /** TCK-590 — la source d'arrivée retenue pour la session (`lib/attribution.ts`). */
  source?: string;
  medium?: string;
}

/**
 * TCK-075 — Server-side PropertyVisit shape returned by
 * `/api/property-visits`. Sparse fieldsets mean most columns are
 * optional in the wire format.
 */
export interface PropertyVisit {
  id: number;
  property_id: number;
  visitor_id?: number | null;
  customer_id?: number | null;
  agent_id?: number | null;
  visitor_name?: string | null;
  visitor_phone?: string | null;
  visitor_email?: string | null;
  type?: VisitType | null;
  status?: VisitStatus | null;
  scheduled_at?: string | null;
  /** TCK-2502 — non nul : `scheduled_at` n'est que le début de la tranche, l'heure reste à fixer. */
  preferred_window?: VisitWindow | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  duration_minutes?: number | null;
  feedback?: string | null;
  rating?: number | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  property?: { id: number; title?: string | null; slug?: string | null } | null;
  visitor?: {
    id: number;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  agent?: { id: number; first_name?: string; last_name?: string } | null;
  customer?: {
    id: number;
    user_id?: number | null;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  created_at?: string | null;
  /**
   * P152.04 — rendu sur la seule visite de la route : `manage` dit si l'utilisateur courant peut la
   * confirmer, la clore, la déclarer manquée, la déplacer ou l'annuler au nom de ceux qui gèrent le
   * bien (`PropertyVisitPolicy::update` et `agitPourLeBien`). Absent, rien n'est offert.
   */
  /**
   * `feedback_customer` (TCK-2581, AC6 ; API 627ecd6e6) : le lecteur est le DEMANDEUR de la visite (le
   * visiteur, ou le client de la fiche) — celui dont l'API accepte l'avis visiteur et un autre créneau.
   * Il ne reçoit ni `customer` ni `visitor` (fiche masquée, TCK-2585) : sans ce drapeau, le front ne
   * peut pas le reconnaître. Détail seulement, comme `manage`.
   */
  abilities?: {
    readonly manage: boolean;
    readonly feedback_customer?: boolean;
    /**
     * TCK-2716 — « Créer sa fiche » : vrai exactement quand `POST /api/customers` avec
     * `property_visit_id` réussirait pour ce lecteur (personnel actif de l'agence du bien, sous son
     * espace, visite sans fiche). Le préremplissage et le geste ne s'allument que sur lui.
     */
    readonly create_customer?: boolean;
  };
  /**
   * TCK-2578 / TCK-2581 (ADR-0101) — le compte rendu de l'agence. Clé ABSENTE hors du personnel de
   * l'agence du bien (visiteur, client, bailleur) : sa présence est la garde (`compteRenduLisible`).
   * `null` : lisible, pas encore écrit.
   */
  report?: CompteRendu | null;
  /**
   * TCK-2585 — la carte du visiteur, pour le personnel de l'agence du bien (et le propriétaire d'un
   * bien sans agence) ; `null` pour tout autre lecteur. `visits_on_property` compte celle-ci.
   */
  visitor_display?: {
    readonly name: string | null;
    readonly phone: string | null;
    readonly kind: 'customer' | 'account' | 'anonymous';
    readonly visits_on_property: number;
  } | null;
}

export interface VisitFeedbackPayload {
  role: 'customer' | 'agent';
  rating?: number;
  comment?: string;
}

export interface BookingRequestPayload {
  start_date: string;
  end_date: string;
  guests: number;
  message?: string;
}

/**
 * TCK-176 — purchase-offer payload for a `sale` property. Posts to the
 * same endpoint (`/api/public/properties/{slug}/booking-request`) but
 * never sends `start_date` / `end_date` / `guests`.
 */
export interface OfferRequestPayload {
  offer_amount: number;
  offer_expires_at: string;
  terms_accepted: true;
  message?: string;
}

export interface ReportPayload {
  /** Un code : celui d'une annonce (`ReportPublicPropertyRequest`) ou d'un avis (`ReviewReportReason`). */
  reason: string;
  details?: string;
  /** Pot de miel : vide pour un humain (TCK-597). */
  company?: string;
}
