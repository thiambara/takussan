export interface Property {
  id: string;
  title: string;
  description: string;
  price: number;
  priceType: 'sale' | 'rent';
  currency: string;
  location: {
    address: string;
    city: string;
    state: string;
    zipCode: string;
    coordinates: {
      lat: number;
      lng: number;
    };
  };
  propertyType: 'apartment' | 'house' | 'commercial' | 'land' | 'condo';
  area: number;
  bedrooms: number;
  bathrooms: number;
  images: string[];
  amenities: string[];
  features: string[];
  owner: {
    id: string;
    name: string;
    avatar: string;
    phone: string;
    email: string;
  };
  agent?: {
    id: string;
    name: string;
    avatar: string;
    phone: string;
    email: string;
    company: string;
  };
  isVerified: boolean;
  isFeatured: boolean;
  createdAt: Date;
  updatedAt: Date;
  availableFrom?: Date;
  status: 'available' | 'pending' | 'sold' | 'rented';
}

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
  sortBy?: 'price-asc' | 'price-desc' | 'date-newest' | 'date-oldest' | 'area-asc' | 'area-desc';
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  favoriteProperties: string[];
}
