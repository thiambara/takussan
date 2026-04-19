export interface SearchFilters {
  q?: string;
  location?: string;
  city?: string;
  contract_type?: 'sale' | 'rent';
  type?: string;
  rent_period?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  price_min?: number;
  price_max?: number;
  bedrooms?: number;
  bathrooms?: number;
  area_min?: number;
  area_max?: number;
  furnished?: boolean;
  featured?: boolean;
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
