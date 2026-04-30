export type SuggestCity = {
  label: string;
  slug?: string;
  count: number;
};

export type SuggestNeighborhood = {
  label: string;
  city: string;
  slug?: string;
  count: number;
};

export type SuggestPropertyType = {
  label: string;
  value: string;
  count: number;
};

export type SuggestResponse = {
  data: {
    cities: SuggestCity[];
    neighborhoods: SuggestNeighborhood[];
    property_types: SuggestPropertyType[];
  };
};

export interface SearchFilters {
  q?: string;
  location?: string;
  city?: string;
  contract_type?: 'sale' | 'rent';
  type?: string[];
  rent_period?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  price_min?: number;
  price_max?: number;
  bedrooms?: number;
  bathrooms?: number;
  area_min?: number;
  area_max?: number;
  furnished?: boolean;
  featured?: boolean;
  floor_number?: number;
  available_from?: string; // ISO date YYYY-MM-DD
  tags?: string;           // comma-separated tag names, e.g. "piscine,parking"
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'created_desc';
  page?: number;
  per_page?: number;
}

export interface Facets {
  locations: Record<string, number>;
  bedrooms: Record<string, number>;
  types: Record<string, number>;
}

export interface SearchResult {
  data: import('./property').PropertyListItem[];
  facets: Facets;
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}
