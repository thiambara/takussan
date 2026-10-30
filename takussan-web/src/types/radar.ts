/**
 * TCK-2386 (ADR-0077) — le Radar, côté console : les formes que rendent `GET /api/admin/radar/*`
 * et `POST /api/admin/radar/listings`. Les valeurs recopient `App\Models\Enums\RadarListingStage`,
 * `RadarSourceSite` et `RadarSourceKind`.
 */

/** Les étapes d'une annonce, dans l'ordre de l'enum de l'API (celui des compteurs du tableau de bord). */
export const RADAR_LISTING_STAGES = [
  'captured',
  'extracted',
  'reviewed',
  'contacted',
  'consented',
  'published',
  'extraction_failed',
  'duplicate',
  'discarded',
  'refused',
  'do_not_contact',
  'purged',
] as const;

export type RadarListingStage = (typeof RADAR_LISTING_STAGES)[number];

export const RADAR_SOURCE_SITES = ['coinafrique', 'expat_dakar', 'facebook', 'whatsapp', 'other'] as const;

export type RadarSourceSite = (typeof RADAR_SOURCE_SITES)[number];

export type RadarSourceKind = 'url' | 'text' | 'captures';

export type RadarConfidence = 'high' | 'medium' | 'low';

/** Un champ extrait, relu par `ExtractionNormalizer` : `{value, confidence, evidence, flags}`. */
export interface RadarExtractedField<T> {
  readonly value: T | null;
  readonly confidence: RadarConfidence;
  readonly evidence?: string | null;
  readonly flags?: readonly string[];
  /** `true` : l'opérateur a remplacé la valeur lue (`RadarReviewFields::apply`). */
  readonly corrected?: boolean;
}

export interface RadarNeighborhoodSuggestion {
  readonly id: number;
  readonly name: string;
  readonly city: string;
}

/** Les drapeaux que lève `ExtractionNormalizer` sur un champ (`FLAG_*`). */
export const RADAR_FIELD_FLAGS = [
  'evidence_missing',
  'evidence_not_in_source',
  'out_of_bounds',
  'invalid_value',
  'unparsed_amount',
] as const;

export type RadarFieldFlag = (typeof RADAR_FIELD_FLAGS)[number];

/** Les types de bien que la fiche propose, dans l'ordre de `App\Models\Enums\PropertyType`. */
export const RADAR_PROPERTY_TYPES = [
  'land', 'house', 'apartment', 'villa', 'studio', 'room', 'office', 'shop',
  'warehouse', 'factory', 'farm', 'hotel', 'resort', 'garage', 'parking', 'other',
] as const;

export type RadarContract = 'rent' | 'sale';

/** `App\Models\Enums\RadarAdvertiserNature`. */
export const RADAR_ADVERTISER_NATURES = ['probable_owner', 'probable_intermediary', 'agency', 'unknown'] as const;

export type RadarAdvertiserNature = (typeof RADAR_ADVERTISER_NATURES)[number];

/** Un indice de nature rendu par le modèle, avec le passage qui le porte. */
export interface RadarNatureSignal {
  readonly signal: string;
  readonly evidence: string | null;
}

/**
 * `radar_listings.extracted` en entier (`ExtractionNormalizer::normalize`) : une entrée par champ, puis
 * les téléphones et les indices de nature. Une fiche lue il y a longtemps, ou une extraction partielle,
 * peut n'en porter qu'une partie : tout est facultatif.
 */
export interface RadarExtracted {
  readonly title?: RadarExtractedField<string>;
  readonly description?: RadarExtractedField<string>;
  readonly property_type?: RadarExtractedField<string>;
  readonly contract?: RadarExtractedField<RadarContract>;
  /** `value` = montant entier en XOF ; `period` = la période lue dans le prix. */
  readonly price?: RadarExtractedField<number> & { readonly raw?: string | null; readonly period?: string | null };
  readonly rent_period?: RadarExtractedField<string>;
  readonly neighborhood?: RadarExtractedField<string> & {
    readonly neighborhood_id?: number | null;
    readonly suggestions?: readonly RadarNeighborhoodSuggestion[];
  };
  readonly city?: RadarExtractedField<string>;
  readonly bedrooms?: RadarExtractedField<number>;
  readonly bathrooms?: RadarExtractedField<number>;
  readonly surface_m2?: RadarExtractedField<number>;
  readonly furnished?: RadarExtractedField<boolean>;
  readonly amenities?: RadarExtractedField<readonly string[]>;
  readonly advertiser_name?: RadarExtractedField<string>;
  readonly advertiser_nature?: RadarExtractedField<RadarAdvertiserNature>;
  /** E.164, ceux que la source porte (les invalides tombent). */
  readonly phones?: readonly string[];
  /** Drapeaux des numéros (`evidence_not_in_source`). */
  readonly phones_flags?: readonly string[];
  /** Les numéros que la source ne porte pas : gardés à part, jamais rattachés. */
  readonly phones_dropped?: readonly string[];
  readonly nature_signals?: readonly RadarNatureSignal[];
}

/** Une ligne de la liste — les seules colonnes de `RADAR_LISTING_FIELDS`. */
export interface RadarListingRow {
  readonly id: number;
  readonly source_kind: RadarSourceKind;
  readonly source_site: RadarSourceSite;
  readonly source_url: string | null;
  readonly extracted: RadarExtracted | null;
  readonly stage: RadarListingStage;
  /** Un code (`radar.fetch.*`, `ai.*`, `radar.extraction.*`), jamais de prose. */
  readonly stage_reason: string | null;
  readonly created_at: string;
}

export interface RadarDashboard {
  readonly stages: Record<RadarListingStage, number>;
  /** `captured` avec un motif : compté aussi dans `stages.captured`. */
  readonly pending_extraction: number;
  /** TCK-2388 : annonceurs distincts à relancer (message envoyé, sans issue, échéance passée). */
  readonly follow_ups_due: number;
  /** TCK-2388 : messages envoyés qui attendent encore leur échéance de relance. */
  readonly outreaches_awaiting: number;
  readonly ai: {
    readonly spent_today_xof: number;
    readonly daily_budget_xof: number | null;
    readonly global_spent_today_xof: number;
    readonly global_daily_budget_xof: number | null;
  };
}

export interface RadarDashboardResponse {
  readonly data: RadarDashboard;
}

/** Une ligne de la réponse de saisie : une par URL, une seule pour un texte ou des captures. */
export interface RadarIntakeRow {
  readonly id: number;
  readonly stage: RadarListingStage;
  /** `true` : empreinte déjà connue — la fiche existante, aucun nouveau passage (sauf `requeued`). */
  readonly existing: boolean;
  /** `true` : une fiche connue dont l'extraction avait échoué, remise en file par ce renvoi. */
  readonly requeued?: boolean;
}

export interface RadarIntakeResponse {
  readonly data: RadarIntakeRow[];
}

/** Les trois formes de saisie, exclusives : l'API refuse `source_site` avec `urls`. */
export type RadarIntakePayload =
  | { readonly kind: 'urls'; readonly urls: readonly string[] }
  | { readonly kind: 'text'; readonly text: string; readonly sourceSite?: RadarSourceSite }
  | { readonly kind: 'captures'; readonly files: readonly File[]; readonly sourceSite?: RadarSourceSite };

/** Une capture d'écran de la fiche : l'URL est signée et expire (5 minutes), la fiche se relit pour la renouveler. */
export interface RadarCapture {
  readonly id: number;
  readonly mime_type: string;
  readonly size: number;
  readonly sha256: string | null;
  readonly url: string;
}

export interface RadarAdvertiser {
  readonly id: number;
  readonly phone: string | null;
  readonly display_name: string | null;
  readonly nature: RadarAdvertiserNature;
  readonly do_not_contact_at: string | null;
}

/** Le quartier du référentiel rattaché à la fiche (`neighborhood_link`), `null` tant qu'aucun ne l'est. */
export interface RadarNeighborhoodLink {
  readonly id: number;
  readonly name: string;
  readonly city: string | null;
}

/** L'avancement du calcul des empreintes des photos source (`RadarListing::photoFingerprintStatus`). */
export interface RadarPhotoFingerprints {
  readonly status: 'none' | 'pending' | 'done';
  readonly total: number;
  readonly done: number;
}

/** `GET|PATCH /api/admin/radar/listings/{id}` : la fiche complète, source comprise. */
export interface RadarListingDetail extends RadarListingRow {
  readonly radar_advertiser_id: number | null;
  readonly raw_text: string | null;
  readonly photo_urls: readonly string[];
  readonly extracted_at: string | null;
  readonly updated_at?: string;
  readonly property_id: number | null;
  readonly duplicate_of_listing_id: number | null;
  readonly duplicate_of_property_id: number | null;
  readonly photo_fingerprints: RadarPhotoFingerprints;
  readonly neighborhood_link: RadarNeighborhoodLink | null;
  readonly advertiser: RadarAdvertiser | null;
  /** Présent pour une annonce saisie par captures. */
  readonly captures?: readonly RadarCapture[];
  /** TCK-2392 — la fiche et ses doublons, chacun avec sa source et sa présence relevée par la collecte. */
  readonly provenances?: readonly RadarProvenance[];
  /** TCK-2392 — l'instant d'une fusion automatique ; `null` pour un doublon posé à la main. */
  readonly merged_at?: string | null;
  /** TCK-2392 — le passage de collecte qui a trouvé l'annonce ; `null` pour une saisie d'opérateur. */
  readonly discovered_by_run_id?: number | null;
}

export interface RadarListingDetailResponse {
  readonly data: RadarListingDetail;
}

/**
 * Les corrections d'une fiche (`PATCH`) : les seuls champs modifiés, aux types que porte `extracted`.
 * `null` efface (sauf la nature de l'annonceur).
 */
export interface RadarListingChanges {
  readonly property_type?: string | null;
  readonly contract?: RadarContract | null;
  readonly rent_period?: string | null;
  readonly price?: number | null;
  readonly neighborhood_id?: number | null;
  readonly city?: string | null;
  readonly bedrooms?: number | null;
  readonly bathrooms?: number | null;
  readonly surface_m2?: number | null;
  readonly furnished?: boolean | null;
  readonly amenities?: readonly string[] | null;
  readonly title?: string | null;
  readonly description?: string | null;
  readonly advertiser_nature?: RadarAdvertiserNature;
}

// ─── Rapprochements et gestes (TCK-2387, tâche 8) ────────────────────────────────────────────

export type RadarMatchStrength = 'high' | 'medium' | 'low';

/** `RadarMatcher::SIGNAL_*`. */
export const RADAR_MATCH_SIGNALS = ['phone', 'neighborhood_price_bedrooms', 'photo', 'text'] as const;

export type RadarMatchSignalName = (typeof RADAR_MATCH_SIGNALS)[number];

export interface RadarMatchSignal {
  readonly signal: RadarMatchSignalName | string;
  readonly strength: RadarMatchStrength;
  /** Photo : distance de Hamming des empreintes. */
  readonly distance?: number;
  /** Quartier, prix, chambres : l'écart relatif de prix. */
  readonly price_gap?: number;
  /** TCK-2392 — texte : la similarité des deux descriptions, de 0 à 1. */
  readonly similarity?: number;
}

/** La cible d'un rapprochement vers un bien du catalogue (`RadarMatchPresenter::properties`). */
export interface RadarPropertyTarget {
  readonly title: string | null;
  readonly price: number | null;
  readonly bedrooms: number | null;
  readonly neighborhood: string | null;
  readonly status: string | null;
  /** Public : une fiche publique existe (`/properties/{slug}`). */
  readonly is_public: boolean;
  readonly slug: string | null;
  readonly reference_number: string | null;
  readonly thumbnail_url: string | null;
}

/** La cible d'un rapprochement vers une autre annonce du Radar (`RadarMatchPresenter::listings`). */
export interface RadarListingTarget {
  readonly title: string | null;
  readonly price: number | null;
  readonly stage: RadarListingStage;
  readonly source_site: RadarSourceSite | null;
  readonly thumbnail_url: string | null;
}

interface RadarMatchBase {
  readonly id: number;
  readonly strength: RadarMatchStrength;
  readonly signals: readonly RadarMatchSignal[];
}

export type RadarMatch =
  | (RadarMatchBase & { readonly kind: 'property'; readonly target: RadarPropertyTarget })
  | (RadarMatchBase & { readonly kind: 'listing'; readonly target: RadarListingTarget });

export interface RadarMatches {
  readonly photos: RadarPhotoFingerprints;
  readonly matches: readonly RadarMatch[];
}

export interface RadarMatchesResponse {
  readonly data: RadarMatches;
}

/** `App\Models\Enums\RadarDiscardReason` : la liste fermée, sans texte libre. */
export const RADAR_DISCARD_REASONS = [
  'not_real_estate',
  'out_of_scope',
  'no_longer_available',
  'unusable_source',
  'other',
] as const;

export type RadarDiscardReason = (typeof RADAR_DISCARD_REASONS)[number];

/** « Doublon de » : une autre annonce OU un bien, jamais les deux. */
export type RadarDuplicateTarget =
  | { readonly of_listing_id: number; readonly of_property_id?: never }
  | { readonly of_property_id: number; readonly of_listing_id?: never };

// ─── L'annonceur et son message d'accord (TCK-2388) ──────────────────────────────────────────

/**
 * Les langues du message (`RADAR_MESSAGE_LOCALES`, décision du porteur du 2026-10-28) : le français et
 * l'anglais. Le wolof est en pause : l'API rend 422 `radar.outreach.locale_unsupported` pour tout autre code.
 */
export const RADAR_MESSAGE_LOCALES = ['fr', 'en'] as const;

export type RadarMessageLocale = (typeof RADAR_MESSAGE_LOCALES)[number];

/** `ConsentMessageComposer::SALUTATION_MAX` et `SUMMARY_MAX` : au-delà, le composeur rogne — le champ s'arrête donc là. */
export const RADAR_SALUTATION_MAX = 120;
export const RADAR_SUMMARY_MAX = 500;

/** Le motif d'une issue (`RecordRadarOutreachOutcomeRequest` : `max:2000`). */
export const RADAR_REASON_MAX = 2000;

/** TCK-2413 — le motif facultatif de « délier le compte » (`ReleaseRadarAdvertiserAccountRequest`). */
export const RADAR_ACCOUNT_RELEASE_REASON_MAX = 500;

/** `StoreRadarOutreachRequest::MAX_LISTINGS` : les annonces qu'un seul message peut couvrir. */
export const RADAR_OUTREACH_MAX_LISTINGS = 20;

/** L'état d'un message (`RadarOutreachResource::status`) : `closed` = une issue finale est posée. */
export const RADAR_OUTREACH_STATUSES = ['prepared', 'sent', 'closed'] as const;

export type RadarOutreachStatus = (typeof RADAR_OUTREACH_STATUSES)[number];

/** `App\Models\Enums\RadarOutreachOutcome`. */
export const RADAR_OUTREACH_OUTCOMES = ['consented', 'refused', 'stop', 'question', 'no_answer'] as const;

export type RadarOutreachOutcome = (typeof RADAR_OUTREACH_OUTCOMES)[number];

/** Ce que l'IA a lu dans une réponse (`classification` du verdict). Un verdict n'ouvre rien : seul l'humain confirme. */
export const RADAR_VERDICT_CLASSIFICATIONS = ['consent', 'refusal', 'stop', 'question', 'ambiguous'] as const;

export type RadarVerdictClassification = (typeof RADAR_VERDICT_CLASSIFICATIONS)[number];

/** `App\Models\Enums\RadarOutreachChannel` (TCK-2395) : par où le message est parti. */
export type RadarOutreachChannel = 'whatsapp_manual' | 'whatsapp_cloud';

/**
 * L'état d'un envoi par l'API : `accepted` (Meta a rendu un identifiant) ou `ambiguous` (délai, 5xx : il a pu partir) à
 * l'envoi (TCK-2395), puis les accusés de Meta qui le font avancer (TCK-2427, `RadarWhatsappReceipts`) : `sent`,
 * `delivered`, `read`, ou `failed` (non remis).
 */
export type RadarOutreachProviderStatus = 'accepted' | 'ambiguous' | 'sent' | 'delivered' | 'read' | 'failed';

/** `App\Models\Enums\RadarConsentProof`. */
export type RadarConsentProof = 'screenshot' | 'provider_message' | 'otp';

export type RadarVerificationStatus = 'pending' | 'done' | 'failed';

/** `RadarConsentVerdict::from` : la sortie de l'agent, relue par le code (numéro, clauses). */
export interface RadarVerdict {
  readonly classification: RadarVerdictClassification;
  readonly confidence: RadarConfidence;
  readonly transcript: string;
  readonly reply_text: string | null;
  readonly counterpart_phone: string | null;
  readonly counterpart_name: string | null;
  readonly number_matches: boolean | null;
  readonly number_checked_by: 'code' | 'model';
  readonly name_matches: boolean | null;
  /** L'API l'écrit toujours ; l'écran se défend d'une ligne mal formée (`Array.isArray`). */
  readonly clauses_found: readonly number[];
  readonly clauses_complete: boolean;
  /** Des codes, jamais de prose. L'API l'écrit toujours ; absent, `discordancesDe` lit « pas de verdict exploitable ». */
  readonly discordances?: readonly string[];
}

export interface RadarConsentCapture {
  readonly id: number;
  /** Signée : elle expire, la fiche se relit pour la renouveler. */
  readonly url: string;
  readonly sha256: string | null;
}

/** Une réponse d'annonceur déposée (`RadarConsentResource`). */
export interface RadarConsent {
  readonly id: number;
  readonly proof: RadarConsentProof;
  readonly captures: readonly RadarConsentCapture[];
  readonly verification_status: RadarVerificationStatus;
  /** Un code `radar.verification.*` quand la vérification a échoué ou n'a rien pu lire. */
  readonly verification_reason: string | null;
  readonly verdict: RadarVerdict | null;
  readonly transcript: string | null;
  readonly confirmed_by: { readonly id: number; readonly name: string } | null;
  readonly confirmed_at: string | null;
  readonly confirmation_reason: string | null;
  readonly revoked_at: string | null;
  readonly created_at: string;
}

/** Un morceau du message : `fixed` est le gabarit des clauses (figé), `salutation` et `resume` se retouchent. */
export interface RadarMessageSegment {
  readonly kind: 'fixed' | 'salutation' | 'resume';
  readonly text: string;
}

export interface RadarOutreachFollowUp {
  readonly due_at: string | null;
  readonly propose_no_answer: boolean;
}

/** Un message de démarchage (`RadarOutreachResource`) — le texte (`message`, `segments`) est TOUJOURS celui de l'API. */
export interface RadarOutreach {
  readonly id: number;
  readonly locale: string;
  readonly clauses_version: string;
  readonly status: RadarOutreachStatus;
  readonly listing_ids: readonly number[];
  readonly salutation: string;
  readonly summary: string;
  readonly message: string;
  readonly segments: readonly RadarMessageSegment[];
  /** Absent (`null`) tant que les deux parties ne sont pas écrites, une fois envoyé, si l'annonceur a dit STOP, et si `send_blocked`. */
  readonly wa_me_url: string | null;
  /** Brouillon seulement : le code du refus qu'essuierait « J'ai envoyé » (annonce d'un autre annonceur, chaîne fermée, annonce sortie d'étape). */
  readonly send_blocked: string | null;
  readonly follow_up_of_id: number | null;
  readonly follow_up_rank: number;
  readonly created_by: { readonly id: number; readonly name: string } | null;
  readonly created_at: string;
  readonly sent_at: string | null;
  readonly outcome: RadarOutreachOutcome | null;
  readonly outcome_at: string | null;
  readonly follow_up: RadarOutreachFollowUp | null;
  readonly consents: readonly RadarConsent[];
  /** TCK-2395 — `whatsapp_manual` (lien `wa.me`, valeur par défaut, brouillon compris) ou `whatsapp_cloud` (l'API). */
  readonly channel: RadarOutreachChannel;
  /** TCK-2395 — `null` pour un message manuel ou un brouillon. */
  readonly provider_status: RadarOutreachProviderStatus | null;
}

/** La réponse de la préparation : le message, plus ce que l'IA a rendu (`ai_error` : un code, jamais de prose). */
export interface RadarPreparedOutreach extends RadarOutreach {
  readonly generated: boolean;
  readonly ai_error: string | null;
}

/** La prise en charge d'un annonceur : à qui, jusqu'à quand, et si c'est à l'utilisateur courant. */
export interface RadarClaim {
  readonly by: { readonly id: number; readonly name: string };
  readonly until: string;
  readonly mine: boolean;
}

/** Une annonce de la fiche annonceur (`RadarAdvertiserResource::cardPart`). */
export interface RadarAdvertiserListing {
  readonly id: number;
  readonly stage: RadarListingStage;
  readonly source_site: RadarSourceSite;
  readonly title: string | null;
  readonly price: number | null;
  readonly property_type: string | null;
  readonly contract: RadarContract | null;
  readonly neighborhood: string | null;
  readonly bedrooms: number | null;
  readonly covered_by_consent: boolean;
  readonly created_at: string;
  /** TCK-2413 — un code (`radar.publish.no_photo`…) : pourquoi la publication de la réclamation l'a laissée à l'opérateur. */
  readonly stage_reason: string | null;
  /** TCK-2413 — l'échéance de purge d'une annonce jamais publiée (ADR-0077 §9). */
  readonly purge_at: string | null;
}

/** TCK-2413 — le compte rattaché à l'annonceur ; supprimé, il bloque la réclamation tant qu'il n'est pas délié. */
export interface RadarAdvertiserAccount {
  readonly user_id: number;
  readonly deleted: boolean;
  /** Le geste « délier » est offert : compte supprimé, et aucun STOP ni révocation. */
  readonly releasable: boolean;
  /** L'annonceur a réclamé avec ce compte ; sinon, c'est le compte que le Radar a créé pour lui. */
  readonly claimed: boolean;
}

/** `POST /api/admin/radar/advertisers/{id}/release-account` (TCK-2413). */
export interface RadarAccountReleaseResponse {
  readonly data: { readonly advertiser_id: number; readonly previous_user_id: number };
}

/** `GET /api/admin/radar/advertisers/{id}` : la fiche annonceur. */
export interface RadarAdvertiserDetail {
  readonly id: number;
  readonly phone: string | null;
  readonly display_name: string | null;
  readonly nature: RadarAdvertiserNature;
  readonly do_not_contact_at: string | null;
  readonly claim: RadarClaim | null;
  readonly nature_signals: readonly RadarNatureSignal[];
  readonly listings: readonly RadarAdvertiserListing[];
  /** Du plus récent au plus ancien. */
  readonly outreaches: readonly RadarOutreach[];
  /** `null` : aucun compte rattaché. */
  readonly account: RadarAdvertiserAccount | null;
  /** TCK-2395 — l'envoi par l'API du numéro du Radar est configuré : le bouton « Envoyer par l'API » s'offre (TCK-2426). */
  readonly whatsapp_api_available: boolean;
}

export interface RadarAdvertiserResponse {
  readonly data: RadarAdvertiserDetail;
}

export interface RadarClaimResponse {
  readonly data: { readonly claim: RadarClaim };
}

export interface RadarOutreachResponse {
  readonly data: RadarOutreach;
}

export interface RadarPreparedOutreachResponse {
  readonly data: RadarPreparedOutreach;
}

/** Un nouveau message : sur des annonces relues, OU la relance d'un message envoyé — jamais les deux. */
export type RadarPrepareRequest =
  | { readonly listing_ids: readonly number[]; readonly locale: RadarMessageLocale }
  | { readonly follow_up_of_id: number; readonly locale: RadarMessageLocale };

/** Les retouches d'un message : seulement les parties modifiées (l'API refuse un corps vide). */
export interface RadarOutreachChanges {
  readonly salutation?: string;
  readonly resume?: string;
}

// ─── Les files d'annonceurs (TCK-2388) ───────────────────────────────────────────────────────

/** `filter[queue]` de `GET /api/admin/radar/advertisers` : une file inconnue ne rend rien. */
export const RADAR_ADVERTISER_QUEUES = ['to_contact', 'awaiting', 'follow_up', 'left_to_operator'] as const;

export type RadarAdvertiserQueue = (typeof RADAR_ADVERTISER_QUEUES)[number];

/** Le message ouvert d'une ligne de file (`RadarAdvertiserResource::rowPart`) : le plus récemment envoyé. */
export interface RadarAdvertiserRowFollowUp {
  readonly outreach_id: number;
  readonly sent_at: string | null;
  readonly due_at: string | null;
  readonly rank: number;
  readonly propose_no_answer: boolean;
}

/**
 * Une ligne de file. Les colonnes de `RADAR_ADVERTISER_FIELDS` ; `claim`, les comptes et `follow_up` sont calculés
 * par l'API et toujours rendus, sparse fieldset compris (la liste lit elle-même les colonnes de la prise).
 * `claim` vaut `null` quand personne ne tient l'annonceur, ou que sa prise est échue.
 */
export interface RadarAdvertiserRow {
  readonly id: number;
  readonly phone: string | null;
  readonly display_name: string | null;
  readonly nature: RadarAdvertiserNature;
  readonly do_not_contact_at: string | null;
  readonly claim: RadarClaim | null;
  readonly counts?: {
    readonly reviewed?: number;
    readonly contacted?: number;
    readonly consented?: number;
  };
  readonly follow_up?: RadarAdvertiserRowFollowUp | null;
  /** TCK-2413 — l'échéance de purge de la première annonce que la publication a laissée ; `null` : aucune. */
  readonly left_purge_at?: string | null;
}

/** Le corps d'une issue (`POST outreaches/{id}/outcome`) : le motif n'est exigé que pour confirmer un accord discordant. */
export interface RadarOutcomeRequest {
  readonly outcome: RadarOutreachOutcome;
  readonly reason?: string;
}

// ─── « Publier pour lui » (TCK-2389) ─────────────────────────────────────────────────────────

/** Les bornes de la réserve de photos : `radar.photos.reserve_max`, et `StoreRadarListingPhotosRequest` (10 par envoi). */
export const RADAR_RESERVE_PHOTOS_MAX = 20;
export const RADAR_PHOTOS_PAR_ENVOI_MAX = 10;

/** La préparation des photos d'une annonce (`RadarListing::photoPreparationStatus`) : `none` = rien à lire à la source. */
export type RadarPhotoPreparationStatus = 'none' | 'pending' | 'done';

export interface RadarPhotoPreparation {
  readonly status: RadarPhotoPreparationStatus;
  readonly total: number;
  readonly done: number;
}

/** Une photo de la réserve : une URL signée de l'original (privé). */
export interface RadarReservePhoto {
  readonly id: number;
  readonly url: string;
}

/** Un rapprochement tel qu'il est gelé sur l'annonce (`RadarMatcher::matchesFor`) : l'identifiant de la cible et ses signaux. */
export interface RadarFrozenMatch {
  readonly kind: 'property' | 'listing';
  readonly id: number;
  readonly signals: readonly RadarMatchSignal[];
}

/** Une annonce couverte par un accord valide, telle que l'aperçu la présente (`RadarPublisher::previewOf`). */
export interface RadarPublicationListing {
  readonly id: number;
  /** Le titre qui sera PUBLIÉ : celui de l'annonce, sinon le titre construit des champs (`title_built`). */
  readonly title: string | null;
  /** Le titre n'est pas celui de l'annonce : il se construit du type, des chambres, du contrat et du quartier (décision 5). */
  readonly title_built: boolean;
  readonly price: number | null;
  readonly contract: RadarContract | null;
  readonly property_type: string | null;
  readonly neighborhood_id: number | null;
  /** Le nom du quartier du référentiel, pour que l'écran dise où le bien sera publié. */
  readonly neighborhood: string | null;
  readonly photo_preparation: RadarPhotoPreparation;
  readonly photos: readonly RadarReservePhoto[];
  readonly matches: readonly RadarFrozenMatch[];
  readonly duplicate_of_listing_id: number | null;
  readonly duplicate_of_property_id: number | null;
  /** Les codes qui bloquent CETTE annonce (`radar.publish.no_photo`, `photos_pending`, `missing_field`). */
  readonly blocking: readonly string[];
}

export interface RadarPublicationAccount {
  /** Un compte est déjà rattaché à l'annonceur (une publication précédente) : il est repris tel quel. */
  readonly exists: boolean;
  readonly first_name: string;
  readonly last_name: string;
  readonly phone: string;
  readonly space_name: string;
}

export interface RadarPublicationPreview {
  readonly advertiser: {
    readonly id: number;
    readonly display_name: string | null;
    readonly nature: RadarAdvertiserNature;
    readonly do_not_contact_at: string | null;
    /** TCK-2394 (ADR-0079) — la première publication de la période de mandat ; `null` : jamais publié sous mandat. */
    readonly mandate_at: string | null;
    /** TCK-2421 — repris par l'annonceur dans son espace : la période de mandat est close (`mandate_at` en reste la trace). */
    readonly mandate_taken_back_at: string | null;
  };
  readonly account: RadarPublicationAccount;
  readonly listings: readonly RadarPublicationListing[];
  /** Les biens que le Radar a DÉJÀ publiés pour cet annonceur : de quoi composer le second message sans la réponse d'un `publish`. */
  readonly published: readonly RadarPublishedProperty[];
  /** Le plafond de photos d'UNE publication (somme des réserves des annonces cochées) : au-delà, l'API refuse en 422. */
  readonly max_photos: number;
  /** Les codes qui bloquent l'ensemble (`radar.advertiser.phone_registered`, `account_unavailable`, `do_not_contact`, `radar.publish.nothing_covered`). */
  readonly blocking: readonly string[];
  /** TCK-2394 — la publication sous mandat Takussan : drapeau `radar_mandate` éteint, `enabled` faux et rien d'autre. */
  readonly mandate: RadarMandatePreview;
}

/** TCK-2394 (ADR-0079, proposé) — ce que l'aperçu dit du mandat (`RadarMandate::preview`). */
export interface RadarMandatePreview {
  readonly enabled: boolean;
  /** L'espace des mandats (réglage `radar.mandate_agency_id`), s'il est désigné et ouvert ; `null` sinon. */
  readonly space: { readonly id: number; readonly name: string } | null;
  /** Ce qui empêche la publication sous mandat (`radar.mandate.space_missing`, `account_exists`, `do_not_contact`, `nothing_covered`). */
  readonly blocking: readonly string[];
}

export interface RadarPublicationPreviewResponse {
  readonly data: RadarPublicationPreview;
}

export interface RadarPublishedProperty {
  readonly id: number;
  readonly slug: string;
  readonly title: string | null;
  readonly radar_listing_id: number | null;
  /** L'adresse publique en français (`RadarPublisher::publicUrl`). */
  readonly public_url: string;
}

export interface RadarPublication {
  /** `null` sous mandat (TCK-2394) : aucun compte n'est créé ni rattaché. */
  readonly user: {
    readonly id: number;
    readonly first_name: string;
    readonly last_name: string;
    readonly phone: string;
  } | null;
  /** L'espace où les biens sont nés : celui de l'annonceur, ou l'espace des mandats. */
  readonly agency: { readonly id: number; readonly name: string; readonly slug: string };
  readonly created_account: boolean;
  /** TCK-2394 — publié sous mandat Takussan (ADR-0079) ; absent d'une publication « pour lui ». */
  readonly mandate?: boolean;
  readonly properties: readonly RadarPublishedProperty[];
}

export interface RadarPublicationResponse {
  readonly data: RadarPublication;
}

/** Le second message : un texte fixe versionné (`publie.v2`, qui porte le lien de réclamation — TCK-2390) et son lien `wa.me`. */
export interface RadarPublishedMessage {
  readonly text: string;
  readonly wa_me: string;
  readonly version: string;
}

export interface RadarPublishedMessageResponse {
  readonly data: RadarPublishedMessage;
}

// ─── Collecte automatique (TCK-2392) ─────────────────────────────────────────────────────────

/** Une provenance de la fiche (`RadarListingResource::withProvenances`). */
export interface RadarProvenance {
  readonly listing_id: number;
  /** L'annonce qui fait foi ; les autres en sont les doublons. */
  readonly is_root: boolean;
  readonly source_kind: RadarSourceKind;
  readonly source_site: RadarSourceSite;
  readonly source_url: string | null;
  readonly stage: RadarListingStage;
  /** Fusionnée automatiquement : l'opérateur peut la séparer. */
  readonly merged_at: string | null;
  /** Trouvée par la collecte, et non saisie. */
  readonly crawled: boolean;
  /** Premier et dernier passage qui l'ont vue — `null` sans instantané. */
  readonly first_seen_at: string | null;
  readonly last_seen_at: string | null;
  readonly last_price: number | null;
}

/** `RadarCrawlStatus`. */
export const RADAR_CRAWL_STATUSES = ['queued', 'running', 'finished', 'failed'] as const;

export type RadarCrawlStatus = (typeof RADAR_CRAWL_STATUSES)[number];

export type RadarCrawlTrigger = 'schedule' | 'manual';

/** Un site collecté (`GET /api/admin/radar/crawl/sources`). */
export interface RadarCrawlSource {
  readonly id: number;
  readonly site: RadarSourceSite;
  readonly enabled: boolean;
  readonly frequency_minutes: number;
  readonly max_pages: number;
  readonly enabled_at: string | null;
  /** `include=operator` : celui au nom duquel les annonces trouvées sont extraites. */
  readonly operator?: { readonly id: number; readonly name: string } | null;
  /** TCK-2438 — les URL de départ réglées, dans l'ordre ; null : celle de la configuration (`default_start_url`). */
  readonly start_urls: readonly string[] | null;
  /** L'URL de départ de la configuration, lue quand `start_urls` est nulle. */
  readonly default_start_url: string | null;
  /** Les hôtes d'où une URL de départ peut partir (déclarés par l'adaptateur du site). */
  readonly start_hosts: readonly string[];
}

export interface RadarCrawlSourcesResponse {
  readonly data: readonly RadarCrawlSource[];
}

export interface RadarCrawlSourceResponse {
  readonly data: RadarCrawlSource;
}

export interface RadarCrawlSourceChanges {
  readonly enabled?: boolean;
  readonly frequency_minutes?: number;
  readonly max_pages?: number;
  /** Vide : retour à l'URL de la configuration. */
  readonly start_urls?: readonly string[];
}

/** Un passage de collecte (`GET /api/admin/radar/crawl/runs`). */
export interface RadarCrawlRun {
  readonly id: number;
  readonly site: RadarSourceSite;
  readonly trigger: RadarCrawlTrigger;
  readonly status: RadarCrawlStatus;
  readonly started_at: string | null;
  readonly finished_at: string | null;
  readonly pages_read: number;
  readonly cards_seen: number;
  readonly listings_created: number;
  readonly listings_known: number;
  readonly snapshots_opened: number;
  readonly reached_end: boolean;
  /** Un code `radar.crawl.*` ou `radar.fetch.*`. */
  readonly stop_reason: string | null;
  readonly created_at: string;
}

export interface RadarCrawlRunResponse {
  readonly data: RadarCrawlRun;
}

/** Les bornes de `config/radar.php` (`radar.crawl`) : le formulaire les respecte, l'API les impose. */
export const RADAR_CRAWL_FREQUENCY_MIN = 60;
export const RADAR_CRAWL_FREQUENCY_MAX = 10_080;
export const RADAR_CRAWL_MAX_PAGES_LIMIT = 20;
/** TCK-2438 — `radar.crawl.max_start_urls`. */
export const RADAR_CRAWL_MAX_START_URLS = 10;

// ─── La relance d'activation (TCK-2394) ──────────────────────────────────────────────────────

/** Un bien publié par le Radar et ce qu'il a rapporté sur la période. */
export interface RadarActivationProperty {
  readonly id: number;
  readonly title: string | null;
  readonly public_url: string;
  readonly views: number;
  readonly contact_requests: number;
  readonly visit_requests: number;
}

/** Les chiffres réels de la période : depuis la dernière relance envoyée, sinon depuis la mise en ligne. */
export interface RadarActivationFigures {
  readonly since: string;
  readonly until: string;
  readonly views: number;
  readonly contact_requests: number;
  readonly visit_requests: number;
  /** Les crédits que l'activation offrira ; 0 s'ils ont déjà été accordés (la ligne sort du texte). */
  readonly welcome_credits: number;
  readonly properties: readonly RadarActivationProperty[];
}

/**
 * L'aperçu de la relance (`RadarActivationReminders::preview`) : `none` quand le Radar n'a créé aucun compte pour
 * l'annonceur ; sinon les chiffres, ce qui bloque et, sans blocage, le texte fixe versionné et son lien `wa.me`.
 */
export interface RadarActivationReminder {
  readonly state: 'none' | 'activation';
  readonly blocking: readonly string[];
  /** La date où la période atteint l'intervalle minimal (`radar.activation.min_interval_days`). */
  readonly available_at: string | null;
  readonly reminders: { readonly count: number; readonly last_at: string | null };
  readonly figures: RadarActivationFigures | null;
  readonly text: string | null;
  readonly wa_me: string | null;
  readonly version: string;
}

export interface RadarActivationReminderResponse {
  readonly data: RadarActivationReminder;
}
