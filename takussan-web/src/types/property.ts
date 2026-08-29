export type PropertyType =
  | 'apartment' | 'house' | 'villa' | 'studio' | 'room'
  | 'land' | 'office' | 'shop' | 'warehouse' | 'factory'
  | 'farm' | 'hotel' | 'resort' | 'garage' | 'parking' | 'other';

export type ContractType = 'sale' | 'rent';

export type RentPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

export type PropertyTitleType = 'bail' | 'titre_foncier' | 'deliberation' | 'autre';

export interface PropertyListItem {
  id: number;
  user_id?: number;
  reference_number: string;
  title: string;
  slug: string;
  price: number;
  currency: string | null;
  type: PropertyType;
  contract_type: ContractType | null;
  rent_period: RentPeriod | null;
  status: string | null;
  visibility: string | null;
  views_count?: number;
  favorites_count?: number;
  location: {
    quarter: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  bedrooms: number | null;
  bathrooms: number | null;
  area: number | null;
  furnished: boolean;
  featured: boolean;
  main_photo_url: string | null;
  owner?: PropertyOwnerLite | null;
  collaborators?: {
    id: number;
    user_id: number;
    role: string | null;
    commission_share: number | null;
    user: {
      id: number;
      name: string;
      email: string | null;
    } | null;
  }[];
  published_at: string | null;
  created_at: string;
}

export interface PropertyOwnerLite {
  id: number;
  name: string;
  /** TCK-177 — links the contact card to /agents/[slug] when populated. */
  slug?: string | null;
  avatar_url: string | null;
  is_agent: boolean;
  member_since: string | null;
}

export interface PropertyAgencyLite {
  id: number;
  name: string;
  slug: string;
  logo_url: string | null;
  verified: boolean;
  rating: number | null;
}

export interface PropertyTag {
  id: number;
  name: string;
  slug: string;
  type: 'amenity' | 'feature' | 'category' | string;
  icon: string | null;
  color: string | null;
}

export interface PropertyPhoto {
  id: number;
  thumbnail: string;
  preview: string;
  /**
   * TCK-356 — la plus grande image servie au PUBLIC (jusqu'à 1600 px de large).
   *
   * `preview` plafonne à 800 px : la grande tuile de la fiche en demande 1450 px
   * physiques en DPR 2, la lightbox davantage. Aucun `sizes` ne rattrape une source
   * qui n'existe pas à la bonne taille.
   *
   * `full` est filigranée comme les autres conversions ; le fichier source ne sort
   * qu'à un appelant autorisé, via `original`.
   */
  full: string;
  /**
   * Le fichier source pour qui détient `viewRaw`, sinon `full` (TCK-106).
   * Ce n'est donc PAS l'original pour un visiteur — c'est la plus grande image
   * filigranée qu'on accepte de lui servir.
   */
  original: string;
  order: number;
}

export interface PropertyMediaExtra {
  videos: string[];
  plans: string[];
  virtual_tour_url: string | null;
}

export interface PropertyDocument {
  id: number;
  name: string;
  type: string;
  size: number;
  url: string;
  public: boolean;
}

export interface PropertyPriceHistoryItem {
  id: number;
  old_price: number;
  new_price: number;
  currency: string;
  reason: string | null;
  changed_at: string;
}

export interface PropertyDetail extends PropertyListItem {
  type_label: string;
  contract_type_label: string | null;
  rent_period_label: string | null;
  status_label: string;
  title_type: PropertyTitleType | null;
  title_type_label: string | null;
  floor_number: number | null;
  total_floors: number | null;
  available_from: string | null;
  year_built: number | null;
  parking_spaces: number | null;
  views_count: number;
  favorites_count: number;
  average_rating: number | null;
  reviews_count: number;
  description: string | null;
  photos: PropertyPhoto[];
  media_extra: PropertyMediaExtra;
  tags: PropertyTag[];
  owner: PropertyOwnerLite;
  agency: PropertyAgencyLite | null;
  documents: PropertyDocument[];
  price_history: PropertyPriceHistoryItem[];
  location: {
    full: string;
    street: string | null;
    quarter: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
    postal_code: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  /**
   * TCK-335 — champs de modération : l'API ne les émet que pour un appelant
   * AUTHENTIFIÉ (`PropertyResource`, `$request->user() !== null`). Un visiteur
   * anonyme reçoit une charge utile où les quatre clés sont **absentes**, pas
   * nulles — d'où l'optionalité. Le tableau de bord agent, lui, est rendu
   * depuis une session : il continue de les recevoir.
   */
  rejection_reason?: string | null;
  submitted_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
}

export interface PaginatedProperties {
  data: PropertyListItem[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

/**
 * Response shape for `GET /api/public/properties/compare?ids=...` (TCK-082).
 * The backend returns a subset of `PropertyDetail` — enough to render a
 * side-by-side comparison table.
 */
export interface PropertyCompareResponse {
  data: PropertyDetail[];
  meta: {
    requested_ids: number[];
    returned_ids: number[];
  };
}

/**
 * Response shape for `GET /api/public/properties/discovery` (TCK-247) — the
 * four homepage rows in a single round-trip, already deduplicated server-side
 * (`featured` excepted: it is a curated row and may overlap the others).
 */
export interface HomepageDiscoveryRow {
  items: PropertyListItem[];
}

export interface HomepageDiscoveryNearRow extends HomepageDiscoveryRow {
  /**
   * The city the row actually contains, spelled as the catalogue spells it —
   * NOT as the visitor's geolocation spelled it. This is what the row title
   * prints.
   */
  city: string;
  /** The city guessed for the visitor, `null` when we had no idea where they are. */
  requested_city: string | null;
  /**
   * `true` when the visitor's city held too few listings and the row switched
   * wholesale to `city`. The title must say so — a row headed « Près de toi ·
   * à Ziguinchor » full of Dakar listings is simply false. Never `true` when
   * `requested_city` is `null`: not knowing is the nominal default, not a
   * fallback.
   */
  fallback: boolean;
}

export interface HomepageDiscoveryData {
  near: HomepageDiscoveryNearRow;
  rent: HomepageDiscoveryRow;
  featured: HomepageDiscoveryRow;
  latest: HomepageDiscoveryRow;
}

export interface HomepageDiscoveryResponse {
  data: HomepageDiscoveryData;
  meta: { per_row: number };
}
