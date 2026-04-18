export type PropertyType =
  | 'apartment' | 'house' | 'villa' | 'studio' | 'room'
  | 'land' | 'office' | 'shop' | 'warehouse' | 'factory'
  | 'farm' | 'hotel' | 'resort' | 'garage' | 'parking' | 'other';

export type ContractType = 'sale' | 'rent';

export type RentPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

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

export interface PropertyDetail extends PropertyListItem {
  description: string | null;
  photos?: Array<{
    thumbnail: string;
    preview: string;
    original: string;
  }> | null;
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
