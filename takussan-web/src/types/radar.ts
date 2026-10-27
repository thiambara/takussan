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
}

export interface RadarNeighborhoodSuggestion {
  readonly id: number;
  readonly name: string;
  readonly city: string;
}

/** Ce que la console lit de `radar_listings.extracted` — le reste du JSON n'est pas typé ici. */
export interface RadarExtracted {
  readonly title?: RadarExtractedField<string>;
  /** `value` = montant entier en XOF ; `period` = la période lue dans le prix. */
  readonly price?: RadarExtractedField<number> & { readonly raw?: string | null; readonly period?: string | null };
  readonly rent_period?: RadarExtractedField<string>;
  readonly neighborhood?: RadarExtractedField<string> & {
    readonly neighborhood_id?: number | null;
    readonly suggestions?: readonly RadarNeighborhoodSuggestion[];
  };
  readonly city?: RadarExtractedField<string>;
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
  /** `true` : empreinte déjà connue — la fiche existante, aucun nouveau passage. */
  readonly existing: boolean;
}

export interface RadarIntakeResponse {
  readonly data: RadarIntakeRow[];
}

/** Les trois formes de saisie, exclusives : l'API refuse `source_site` avec `urls`. */
export type RadarIntakePayload =
  | { readonly kind: 'urls'; readonly urls: readonly string[] }
  | { readonly kind: 'text'; readonly text: string; readonly sourceSite?: RadarSourceSite }
  | { readonly kind: 'captures'; readonly files: readonly File[]; readonly sourceSite?: RadarSourceSite };
