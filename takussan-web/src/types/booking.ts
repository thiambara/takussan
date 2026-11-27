/**
 * Booking types.
 * Aligned with `docs/models-spec.md#5-booking` and `#6-bookingpayment`.
 */

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'cancelled'
  | 'expired'
  | 'completed';

// TCK-2892 — `security_deposit` (la caution d'un séjour) et `other` (qui exige une note).
export type BookingPaymentType = 'deposit' | 'advance' | 'fee' | 'security_deposit' | 'other';

// TCK-1266 (P146.01) — les cas de `PaymentStatus` côté API, à l'identique : l'échec d'un paiement
// en ligne écrit `failed` sur un `BookingPayment`.
export type BookingPaymentStatus =
  | 'pending'
  | 'paid'
  | 'late'
  | 'partially_paid'
  | 'failed'
  | 'refunded'
  | 'cancelled';

/** TCK-2594 — les huit cas de `PaymentMethod` côté API (`app/Models/Enums/PaymentMethod.php`). */
export type BookingPaymentMethod =
  | 'cash'
  | 'bank_transfer'
  | 'mobile_money'
  | 'wave'
  | 'orange_money'
  | 'free_money'
  | 'check'
  | 'card';

export type BookingPayment = {
  id: number;
  booking_id: number;
  user_id: number;
  amount: number;
  currency: 'XOF' | 'XAF' | 'EUR' | 'USD';
  payment_method: BookingPaymentMethod;
  payment_type: BookingPaymentType;
  transaction_id: string | null;
  status: BookingPaymentStatus;
  payment_date: string | null;
  confirmed_date: string | null;
  /** TCK-1180 — ce que `BookingPaymentResource` émet : la date du règlement. */
  paid_at?: string | null;
  receipt_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  /**
   * TCK-2153 (P205.02) — le reversement au bailleur `completed` qui a porté cet acompte, rendu à qui
   * peut lire ce reversement. Le rembourser crée une reprise sur le reversement suivant (TCK-2151).
   */
  paid_out?: { payout_id: number; reference_number: string; processed_at: string | null } | null;
  /** TCK-2877 — le cumul déjà remboursé (TCK-1214 : un remboursement partiel laisse la ligne `paid`). */
  refund_amount?: number | null;
  refund_reason?: string | null;
};

/** TCK-2579 (ADR-0102) — la nature d'une réservation : séjour, candidature ou offre. */
export type BookingKind = 'stay' | 'application' | 'offer';

export type Booking = {
  id: number;
  /** TCK-2579 — posée à la création d'après le bien ; absente d'une lecture qui ne la demande pas. */
  kind?: BookingKind;
  /** TCK-2579 — le prix affiché du bien au moment de la demande (l'écart d'une offre). */
  list_price_at_booking?: number | null;
  /** TCK-2579 — la validité d'une offre, quand l'agent l'a saisie. */
  offer_expires_at?: string | null;
  /** TCK-2579 — l'auteur de la saisie, quand le personnel l'a faite au nom du client. */
  created_by?: { id: number; name: string } | null;
  recorded_by_staff?: boolean | null;
  /**
   * TCK-2593 — les visites terminées de ce client sur ce bien ; émis au seul personnel de l'agence.
   */
  visits_on_property?: number;
  property_id: number;
  customer_id: number;
  created_by_id: number;
  agency_id?: number | null;
  currency?: 'XOF' | 'XAF' | 'EUR' | 'USD' | null;
  reference_number: string | null;
  status: BookingStatus;
  booking_date: string;
  start_date: string | null;
  end_date: string | null;
  confirmation_date: string | null;
  cancellation_date: string | null;
  /** Backend canonical timestamps (BookingResource). */
  confirmed_at?: string | null;
  cancelled_at?: string | null;
  expires_at?: string | null;
  /**
   * TCK-575 — l'échéance RÉELLE d'une demande en attente : le seuil de l'agence ou `expires_at`, la
   * première échue (`BookingExpirationService::responseDeadline`). `null` : rien ne la fera expirer.
   */
  response_deadline?: string | null;
  expired_at?: string | null;
  cancellation_reason?: string | null;
  price_at_booking: number | null;
  total_amount: number | null;
  deposit_amount: number | null;
  notes: string | null;
  reason_for_rejection: string | null;
  reason_for_cancellation: string | null;
  created_at: string;
  updated_at: string;
  property?: {
    id: number;
    title: string;
    slug: string;
    main_photo_url: string | null;
    price: number;
    currency: string | null;
    contract_type: 'sale' | 'rent' | null;
    rent_period?: string | null;
    /** `PropertyResource` — le quartier sert la ligne « Bien · quartier ». */
    location?: { quarter?: string | null; city?: string | null } | null;
    /** TCK-2594 — « En vente depuis 47 jours » sous la comparaison d'une offre. */
    published_at?: string | null;
    /** TCK-2877 (TCK-2892) — « à partir de 15:00 » / « avant 11:00 » ; `null` : 14:00 / 11:00 (ADR-0110 § 1). */
    check_in_from?: string | null;
    check_out_before?: string | null;
  };
  customer?: {
    id: number;
    user_id?: number | null;
    first_name?: string | null;
    last_name?: string | null;
    /** TCK-2593 — au seul personnel de l'agence de la réservation ; absent pour le client et le bailleur. */
    phone?: string | null;
    /** TCK-2594 — un fait du bloc « Qui » de la fiche (« Fonctionnaire »). */
    occupation?: string | null;
  } | null;
  booking_payments?: BookingPayment[];
  /**
   * TCK-596 — dérivé des paiements : `pending` tant qu'un acompte encaissé reste à rendre sur une
   * réservation annulée, refusée ou expirée ; `refunded` une fois tout rendu.
   */
  refund_status?: 'pending' | 'refunded' | null;
  /**
   * TCK-3007 (ADR-0139) — les gestes de CE lecteur, policy ET état compris (`GestesDeLaReservation`) :
   * servis par le `show` et par les écritures, jamais par une liste. Absent, aucun geste.
   */
  abilities?: BookingAbilities;
  // ── TCK-2875 — les clés de TCK-2870, 2872 et 2893 (ADR-0110), lues par la fiche et la liste ──
  /**
   * TCK-2870 — la dernière visite terminée de ce client sur ce bien : son jour et le verdict de son
   * compte rendu ; `null` sans visite. Au seul personnel de l'agence (mêmes lecteurs que `visits_on_property`).
   */
  last_visit_on_property?: { scheduled_at: string | null; report_verdict: 'interested' | 'thinking' | 'not_interested' | null } | null;
  /** TCK-2870 — les autres demandes EN ATTENTE sur ce bien, au seul personnel. */
  other_pending_on_property?: number;
  /** TCK-2870 — les visites terminées du bien, au seul personnel. */
  property_visits_count?: number;
  /** TCK-2870 — le rang d'une offre parmi celles du bien (1 = la première). */
  offer_rank?: number | null;
  /** TCK-2892 — le nombre de voyageurs d'un séjour ; `null` hors séjour (ou s'il n'a pas été dit). */
  guests?: number | null;
  /** TCK-2870 — durée d'une candidature, en mois, et son renouvellement ; nulles hors candidature. */
  term_months?: number | null;
  renewable?: boolean | null;
  /** TCK-2870 — la caution d'une candidature : en mois de loyer, et son montant (instantané). */
  security_deposit_months?: number | null;
  security_deposit_amount?: number | null;
  advance_months_at_booking?: number | null;
  agency_fee_months_at_booking?: number | null;
  /** TCK-2870 — les conditions d'une offre ; `financing` : les cas d'`OfferFinancing` (TCK-2876). */
  financing?: OfferFinancing | null;
  signature_within_days?: number | null;
  conditions?: string | null;
  /** TCK-2870 — « À verser à l'entrée », DÉRIVÉ par l'API ; `null` hors candidature ou avant TCK-2870. */
  entry_amount?: number | null;
  /**
   * TCK-2872 — la complétude du dossier ; `null` pour un séjour. `missing` : les codes des pièces
   * manquantes, dans l'ordre de l'API (`DossierPiece`).
   */
  dossier?: { received: number; required: number; missing: DossierPiece[] } | null;
  /** TCK-2893 — au seul personnel de l'agence : le garant déclaré et le revenu, MASQUÉ et en rapport au loyer. */
  has_guarantor?: boolean;
  guarantors?: { id: number; first_name: string | null; last_name: string | null; relationship_to_tenant: string | null }[];
  /** Jamais affiché (ADR-0110 § 4) : la fiche dit le rapport au loyer, pas le montant. */
  declared_monthly_income_masked?: string | null;
  income_to_rent_ratio?: number | null;
  // ── TCK-2876 — les clés de TCK-2873 et TCK-2874 (ADR-0110 § 5, 6 et 8) ──
  /** TCK-2873 — la DERNIÈRE contre-offre de l'agence (`null` sans contre-offre) ; les précédentes ne sont pas servies. */
  counter_offer?: BookingCounterOffer | null;
  /** TCK-2873 — qui doit agir sur une réservation en attente : le client (contre-offre ouverte) ou l'agence ; `null` hors `pending`. */
  awaiting?: 'customer' | 'agency' | null;
  /** TCK-2874 — l'origine : le tunnel public, le lien d'invitation envoyé après la visite, ou la saisie du personnel. */
  source?: BookingSource;
  /** TCK-2874 — le passage de la fiche client en Négociation à l'acceptation, au seul personnel ; `null` sans changement. */
  stage_change?: BookingStageChange | null;
  // ── TCK-2879 ──
  /**
   * TCK-2879 — ce que le client a déjà réglé (paiements `paid`, ni caution ni « autre »), servi par la
   * LISTE seule (`withSum` de l'index) ; absent de la fiche, qui lit `booking_payments`.
   */
  amount_paid?: number;
};

/** TCK-2870 / TCK-2876 — `OfferFinancing` côté API : comptant, crédit immobilier, apport et crédit. */
export type OfferFinancing = 'cash' | 'mortgage' | 'mixed';

/** TCK-2874 / TCK-2876 — `BookingSource` côté API. */
export type BookingSource = 'public' | 'invitation' | 'staff';

/** TCK-2873 / TCK-2876 — `CounterOfferStatus` côté API. Une `pending` échue est déjà servie `expired`. */
export type CounterOfferStatus = 'pending' | 'accepted' | 'declined' | 'superseded' | 'expired';

/** TCK-2873 / TCK-2876 — `BookingResource::counter_offer`. `valid_until` est un JOUR (`AAAA-MM-JJ`), valable jusqu'au soir à Dakar. */
export type BookingCounterOffer = {
  id: number;
  amount: number;
  message: string | null;
  valid_until: string | null;
  status: CounterOfferStatus;
  created_at: string | null;
  responded_at: string | null;
};

/** TCK-2874 / TCK-2876 — `BookingResource::stage_change` (étapes de `CustomerPipelineStage`). */
export type BookingStageChange = {
  from: string;
  to: string;
  at: string;
  /** `null` une fois le passage annulé. */
  undoable_until: string | null;
  undone_at: string | null;
};

/** TCK-2872 / TCK-2875 — une pièce du dossier d'une candidature ou d'une offre (`DossierPiece` côté API). */
export type DossierPiece =
  | 'identity'
  | 'payslips'
  | 'employment_certificate'
  | 'guarantor_commitment'
  | 'guarantor_identity'
  | 'proof_of_funds'
  | 'other';

/** TCK-2872 / TCK-2875 — une pièce lue par `GET /api/bookings/{id}/dossier`. */
export type PieceDuDossier = {
  piece: DossierPiece;
  required: boolean;
  received: boolean;
  received_at: string | null;
  requested_at: string | null;
  document: { id: number; name: string; type: string | null; created_at: string | null } | null;
};

/** TCK-2872 / TCK-2875 — `GET /api/bookings/{id}/dossier` → `data`. */
export type DossierDeLaReservation = {
  received: number;
  required: number;
  missing: DossierPiece[];
  pieces: PieceDuDossier[];
};

/**
 * TCK-3007 (ADR-0139) — « ce geste est possible maintenant pour ce lecteur », une clé par geste. La
 * fiche n'en recalcule aucun : ni capacité, ni rôle, ni statut (`components/bookings/detail/gestes.ts`).
 */
export interface BookingAbilities {
  confirm: boolean;
  reject: boolean;
  cancel: boolean;
  counter_offer: boolean;
  answer_counter_offer: boolean;
  /** `payments.record` pour le personnel (ADR-0003), le bailleur direct, dans les statuts de l'API. */
  record_payment: boolean;
  /** Remplace `can_refund` (TCK-596) : le droit, et un paiement encaissé à rendre. */
  refund: boolean;
  create_lease: boolean;
  /** Le client règle un séjour ouvert où il reste dû. */
  pay: boolean;
  upload_dossier_piece: boolean;
  request_dossier_piece: boolean;
  manage_guarantors: boolean;
  leave_review: boolean;
}
