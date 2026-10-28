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
export const RADAR_MATCH_SIGNALS = ['phone', 'neighborhood_price_bedrooms', 'photo'] as const;

export type RadarMatchSignalName = (typeof RADAR_MATCH_SIGNALS)[number];

export interface RadarMatchSignal {
  readonly signal: RadarMatchSignalName | string;
  readonly strength: RadarMatchStrength;
  /** Photo : distance de Hamming des empreintes. */
  readonly distance?: number;
  /** Quartier, prix, chambres : l'écart relatif de prix. */
  readonly price_gap?: number;
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
