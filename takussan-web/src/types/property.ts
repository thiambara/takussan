export type PropertyType =
  | 'apartment' | 'house' | 'villa' | 'studio' | 'room'
  | 'land' | 'office' | 'shop' | 'warehouse' | 'factory'
  | 'farm' | 'hotel' | 'resort' | 'garage' | 'parking' | 'other';

export type ContractType = 'sale' | 'rent';

export type RentPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

export type PropertyTitleType = 'bail' | 'titre_foncier' | 'deliberation' | 'other';

export interface PropertyListItem {
  id: number;
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
  published_at: string | null;
  created_at: string;
}

export interface PropertyOwnerLite {
  id: number;
  name: string;
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
  rejection_reason: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
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
