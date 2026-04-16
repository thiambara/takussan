export type PropertyType =
  | 'apartment' | 'house' | 'villa' | 'studio'
  | 'land' | 'office' | 'shop' | 'other';

export interface PropertyListItem {
  id: number;
  title: string;
  slug: string;
  price: number;
  type: PropertyType;
  type_label: string;
  location: { quarter: string; city: string };
  bedrooms: number | null;
  bathrooms: number | null;
  area: number | null;
  featured: boolean;
  main_photo_url: string | null;
  created_at: string;
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
