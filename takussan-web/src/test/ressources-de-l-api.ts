/**
 * TCK-3010 — ce que la doublure de l'API (`api-simulee.ts`) sait de chaque ressource : les clés qui suivent
 * `fields[<table>]`, celles qu'un `include=` apporte, et celles qu'elle rend toujours.
 *
 * C'est la seule chose que la doublure ne peut pas deviner, et c'est là qu'elle ment si on la laisse faire :
 * chaque description est donc GARDÉE contre la `Resource` PHP qu'elle décrit (`__tests__/api-simulee.test.tsx`,
 * « chaque clé de `toArray` est classée ») — une clé ajoutée à l'API sans être rangée ici rougit.
 *
 * Trois sortes de clés, et une règle de prudence :
 * - `colonnes` : sous `fields[<table>]`, l'API ne rend que celles demandées. `id` compris : seule une Resource qui
 *   le force (`idToujours`, gardé contre le PHP) le rend sans qu'on le demande — `BookingResource` et
 *   `LeaseResource` le rendent `null` sous `fields[…]=status` (mesuré par tinker, TCK-3010). Laravel en omet une
 *   partie (`whenHas`, `lue()`) et rend les autres à `null` ; la doublure les omet toutes — l'écran ne lit rien
 *   d'utile dans les deux cas — et SIGNALE leur lecture.
 * - `inclusions` : le nom passé à `include=` → les clés qu'il apporte. Sous `fields`, absentes sans lui, et
 *   leur lecture signalée.
 * - `calculees` : rendues telles que le test les donne, jamais signalées. Y va toute clé dont la règle n'est pas
 *   établie (relation chargée par le contrôleur quoi qu'on demande, valeur dérivée, gestes du lecteur) : un faux
 *   signalement coûte plus cher qu'un manque.
 *
 * Sans `fields[<table>]` dans la requête, la ressource est rendue entière, comme l'API le fait.
 * Les blocs imbriqués (`property` sous `fields[properties]`) sont rendus entiers : la doublure ne les borne pas.
 */

export interface DescriptionDeRessource {
  /** Le chemin de la liste ; le détail est `<route>/<id>`. */
  readonly route: string;
  /** La table de `fields[<table>]`. */
  readonly table: string;
  readonly colonnes: readonly string[];
  readonly inclusions: Readonly<Record<string, readonly string[]>>;
  readonly calculees: readonly string[];
  /** `id` rendu sous `fields[<table>]` même non demandé (`['id', ...$noms]` de la Resource). */
  readonly idToujours: boolean;
  /** Les inclusions que `show` charge quoi que dise `include=` : au détail, elles valent `null` sans donnée. */
  readonly inclusAuDetail: readonly string[];
  /** La `Resource` décrite, depuis `takussan-api/` : la garde y relit les clés de `toArray`. */
  readonly php: string;
  /**
   * Les `filter[<nom>]` que la liste accepte : un autre, spatie le refuse en 400 (`InvalidFilterQuery`). Gardés contre
   * le modèle PHP (`modele`, ce que compose `HasQueryBuilder::getAllowedQueryFilters`).
   */
  readonly filtresPermis: readonly string[];
  /** Le modèle de la liste, depuis `takussan-api/` : la garde y relit ses filtres. */
  readonly modele: string;
}

/**
 * Visites — `PropertyVisitResource` filtre TOUTES ses clés par `fields[property_visits]` (TCK-2797) et ses blocs
 * de relation par `include=` ; la garde lit sa méthode `toutesLesCles`.
 */
const visites: DescriptionDeRessource = {
  route: '/api/property-visits',
  table: 'property_visits',
  colonnes: [
    'id', 'property_id', 'visitor_id', 'customer_id', 'agent_id', 'visitor_name', 'visitor_phone', 'visitor_email',
    'type', 'status', 'scheduled_at', 'preferred_window', 'completed_at', 'cancelled_at', 'cancellation_reason',
    // TCK-2871 — qui a annulé (`visitor` | `agency`).
    'cancelled_by',
    'duration_minutes', 'feedback', 'rating', 'notes', 'metadata', 'visitor_display', 'report', 'created_at',
    // TCK-2849 — la capacité de confirmer, au détail et nommée en liste ; TCK-3005 — les gestes de la fiche.
    'can_confirm', 'abilities',
  ],
  inclusions: { property: ['property'], visitor: ['visitor'], agent: ['agent'], customer: ['customer'] },
  calculees: [],
  // `requestedFields` : `['id', ...$noms]`.
  idToujours: true,
  // `PropertyVisitController::show` : `load(['property.address', 'property.media', 'agent', 'visitor', 'customer'])`.
  inclusAuDetail: ['property', 'agent', 'visitor', 'customer'],
  php: 'app/Http/Resources/PropertyVisitResource.php',
  filtresPermis: [
    'property_id', 'visitor_id', 'customer_id', 'agent_id', 'type', 'status', 'scheduled_at_min', 'scheduled_at_max',
    'unassigned', 'mine', 'to_close', 'search', 'day',
  ],
  modele: 'app/Models/PropertyVisit.php',
};

/**
 * Réservations — `BookingController::index` charge `property`, `customer` et la dernière contre-offre quoi que
 * dise `include=`, et la fiche y ajoute les paiements : ces blocs sont des `calculees`, pas des inclusions.
 */
const reservations: DescriptionDeRessource = {
  route: '/api/bookings',
  table: 'bookings',
  colonnes: [
    'id', 'reference_number', 'property_id', 'customer_id', 'agency_id', 'status', 'kind', 'offer_expires_at',
    'list_price_at_booking', 'total_amount', 'deposit_amount', 'currency', 'start_date', 'end_date', 'confirmed_at',
    'cancelled_at', 'expires_at', 'cancellation_by', 'cancellation_reason', 'notes', 'guests', 'term_months',
    'renewable', 'security_deposit_months', 'security_deposit_amount', 'advance_months_at_booking',
    'agency_fee_months_at_booking', 'financing', 'signature_within_days', 'conditions', 'source', 'created_at',
  ],
  inclusions: {},
  calculees: [
    'created_by', 'recorded_by_staff', 'response_deadline', 'refund_status', 'booking_payments', 'amount_paid',
    'property', 'customer', 'visits_on_property', 'last_visit_on_property', 'other_pending_on_property',
    'property_visits_count', 'offer_rank', 'entry_amount', 'dossier', 'has_guarantor', 'guarantors',
    'declared_monthly_income_masked', 'income_to_rent_ratio', 'counter_offer', 'awaiting', 'stage_change', 'abilities',
  ],
  idToujours: false,
  // Ce que `show` charge est déjà dans `calculees`.
  inclusAuDetail: [],
  php: 'app/Http/Resources/BookingResource.php',
  filtresPermis: [
    'property_id', 'customer_id', 'created_by_id', 'agency_id', 'status', 'currency', 'kind', 'total_amount_min',
    'total_amount_max', 'managed_by', 'search',
  ],
  modele: 'app/Models/Booking.php',
};

/** Baux — les parties et les clés calculées de la page suivent `include=` (`LeaseResource::computedAndParties`). */
const baux: DescriptionDeRessource = {
  route: '/api/leases',
  table: 'leases',
  colonnes: [
    'id', 'reference_number', 'property_id', 'landlord_id', 'tenant_id', 'agency_id', 'agent_id', 'booking_id',
    'renewed_from_lease_id', 'type', 'status', 'start_date', 'end_date', 'renewal_date', 'monthly_rent',
    'monthly_charges', 'sale_price', 'currency', 'deposit_amount', 'deposit_refunded_amount', 'deposit_refunded_at',
    'deposit_refund_reason', 'commission_rate', 'commission_amount', 'payment_frequency', 'payment_day',
    'late_fee_percent', 'late_fee_grace_days', 'signed_at', 'terminated_at', 'early_termination_requested_at',
    'early_termination_requested_by', 'early_termination_effective_date', 'early_termination_penalty_amount',
    'early_termination_reason', 'early_termination_invoice_id', 'notice_period_days', 'contract_sha256',
    'signature_requested_at', 'created_at',
  ],
  inclusions: {
    property: ['property'],
    tenant: ['tenant'],
    landlord: ['landlord'],
    agent: ['agent'],
    renewedFrom: ['renewed_from'],
    renewals: ['renewals'],
    renewalsCount: ['renewals_count'],
    attention: ['attention'],
    due_summary: ['next_due', 'overdue_count', 'overdue_amount', 'next_due_notice_date'],
    maintenance_summary: ['maintenance_summary'],
    // `LeaseController::calculsDeLaFiche` : le nom d'inclusion n'est pas celui de la clé.
    documentsCount: ['documents_count'],
    historyCount: ['history_count'],
  },
  // `signatures` : la fiche les charge quoi qu'on demande, la liste ne sait pas les inclure (`Lease::$requestLoadable`).
  calculees: [
    'signatures', 'early_termination_penalty_months', 'can_sign_as', 'can_request_signature', 'can_activate_on_paper', 'abilities',
    'origin_booking', 'has_inventory', 'rent_review_cap_pct', 'next_revision_date',
  ],
  idToujours: false,
  // `LeaseController::show` : `load(['property.address', 'signatures.signer', …])`.
  inclusAuDetail: ['property'],
  php: 'app/Http/Resources/LeaseResource.php',
  filtresPermis: [
    'id', 'property_id', 'landlord_id', 'tenant_id', 'agency_id', 'agent_id', 'type', 'status', 'currency',
    'payment_frequency', 'renewed_from_lease_id', 'monthly_rent_min', 'monthly_rent_max', 'a_traiter', 'motif',
    'onboarding_pending', 'search',
  ],
  modele: 'app/Models/Lease.php',
};

export const RESSOURCES = { visites, reservations, baux } as const;

export type NomDeRessource = keyof typeof RESSOURCES;
