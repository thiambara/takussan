export interface SearchFilters {
  location?: string;
  price_min?: number;
  price_max?: number;
  bedrooms?: number;
  sort?: string;
  page?: number;
}

export interface Facets {
  locations: Record<string, number>;
  bedrooms: Record<string, number>;
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
