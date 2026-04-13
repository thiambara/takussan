export interface PropertyFilter {
  searchQuery?: string;
  priceType?: 'sale' | 'rent' | 'all';
  minPrice?: number;
  maxPrice?: number;
  propertyType?: string[];
  minBedrooms?: number;
  maxBedrooms?: number;
  minBathrooms?: number;
  maxBathrooms?: number;
  minArea?: number;
  maxArea?: number;
  amenities?: string[];
  location?: string;
  furnishing?: 'furnished' | 'unfurnished' | 'any';
  status?: string[];
  yearBuilt?: { min?: number; max?: number };
  sortBy?: 'price-asc' | 'price-desc' | 'date-newest' | 'date-oldest' | 'area-asc' | 'area-desc';
}
