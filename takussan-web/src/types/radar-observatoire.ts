import type { RadarAdvertiserNature, RadarContract, RadarSourceSite } from '@/types/radar';

/**
 * TCK-2393 (ADR-0083) — l'observatoire du marché et le classement des annonceurs du Radar, tels que les rend
 * `App\Http\Controllers\Api\Admin\RadarObservatoryController`.
 */

/** `App\Services\Radar\Observatory\RadarObservatory::SECTIONS`. */
export const RADAR_OBSERVATORY_SECTIONS = ['summary', 'price_per_m2', 'time_on_market', 'supply_gap', 'natures', 'gone_sources'] as const;

export type RadarObservatorySection = (typeof RADAR_OBSERVATORY_SECTIONS)[number];

/** La piste commerciale d'un annonceur (`RadarAdvertiserRanking::pipeline()`). */
export const RADAR_PIPELINE_STAGES = ['prospect', 'contacted', 'account', 'upgrade_pending', 'agency', 'do_not_contact'] as const;

export type RadarPipelineStage = (typeof RADAR_PIPELINE_STAGES)[number];

export interface RadarNeighborhoodRef {
  readonly id: number;
  readonly name: string | null;
}

interface RadarMarketGroup {
  readonly neighborhood: RadarNeighborhoodRef | null;
  readonly property_type: string | null;
  readonly contract: RadarContract | null;
}

export interface RadarPricePerM2Row extends RadarMarketGroup {
  readonly rent_period: string | null;
  readonly listings: number;
  readonly median_xof_per_m2: number;
  readonly p25_xof_per_m2: number;
  readonly p75_xof_per_m2: number;
}

export interface RadarTimeOnMarketRow extends RadarMarketGroup {
  readonly gone: number;
  readonly online: number;
  readonly median_days: number | null;
  readonly mean_days: number | null;
}

export interface RadarSupplyGapRow {
  readonly neighborhood: RadarNeighborhoodRef;
  readonly radar_online: number;
  readonly catalog_public: number;
  readonly gap: number;
}

export interface RadarGoneSource {
  readonly listing_id: number;
  readonly source_site: RadarSourceSite;
  readonly gone_at: string | null;
  readonly property: { readonly id: number; readonly title: string | null; readonly public: boolean };
}

export interface RadarObservatory {
  readonly summary?: { readonly listings: number; readonly online: number; readonly gone: number; readonly in_catalog: number; readonly sites: readonly RadarSourceSite[] };
  readonly price_per_m2?: readonly RadarPricePerM2Row[];
  readonly time_on_market?: readonly RadarTimeOnMarketRow[];
  readonly supply_gap?: readonly RadarSupplyGapRow[];
  readonly natures?: Readonly<Record<RadarAdvertiserNature, number>>;
  readonly gone_sources?: readonly RadarGoneSource[];
}

export interface RadarObservatoryResponse {
  readonly data: RadarObservatory;
  /** `confirm_runs` : passages complets d'affilée qui constatent une disparition (`radar.observe.confirm_runs`). */
  readonly meta: { readonly confirm_runs: number };
}

export interface RadarObservatoryFilters {
  readonly since?: string;
  readonly contract?: RadarContract;
  readonly propertyType?: string;
  readonly sourceSite?: RadarSourceSite;
}

export interface RadarRankingRow {
  readonly id: number;
  readonly display_name?: string | null;
  readonly phone?: string | null;
  readonly nature?: RadarAdvertiserNature;
  readonly listings_count: number;
  readonly published_count: number;
  readonly outreaches_count: number;
  readonly neighborhoods_count: number;
  readonly top_neighborhoods: readonly (RadarNeighborhoodRef & { readonly listings: number })[];
  readonly price_ranges: Readonly<Partial<Record<RadarContract | 'unknown', { readonly min: number; readonly max: number }>>>;
  readonly sites: readonly RadarSourceSite[];
  readonly upgrade_status: string | null;
  readonly pipeline: RadarPipelineStage;
}

export interface RadarRankingFilters {
  readonly nature?: RadarAdvertiserNature;
  readonly search?: string;
  readonly page?: number;
  readonly perPage?: number;
}
