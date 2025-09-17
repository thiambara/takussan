import {Injectable} from '@angular/core';
import {BehaviorSubject, Observable, of} from 'rxjs';
import {delay, map} from 'rxjs/operators';
import {Property, PropertyFilter} from '../models/property.interface';

@Injectable({
  providedIn: 'root'
})
export class PropertyService {
  private propertiesSubject = new BehaviorSubject<Property[]>([]);
  properties$ = this.propertiesSubject.asObservable();
  private filtersSubject = new BehaviorSubject<PropertyFilter>({});
  filters$ = this.filtersSubject.asObservable();
  private favoritePropertiesSubject = new BehaviorSubject<string[]>([]);
  favoriteProperties$ = this.favoritePropertiesSubject.asObservable();

  constructor() {
    // Initialize with mock data
    this.loadMockProperties();
  }

  getProperties(filters?: PropertyFilter): Observable<Property[]> {
    return this.properties$.pipe(
      map(properties => this.filterProperties(properties, filters || {})),
      delay(300) // Simulate API delay
    );
  }

  getProperty(id: string): Observable<Property | undefined> {
    return this.properties$.pipe(
      map(properties => properties.find(p => p.id === id))
    );
  }

  updateFilters(filters: PropertyFilter): void {
    this.filtersSubject.next(filters);
  }

  addToFavorites(propertyId: string): Observable<boolean> {
    const currentFavorites = this.favoritePropertiesSubject.value;
    if (!currentFavorites.includes(propertyId)) {
      this.favoritePropertiesSubject.next([...currentFavorites, propertyId]);
    }
    return of(true).pipe(delay(200));
  }

  removeFromFavorites(propertyId: string): Observable<boolean> {
    const currentFavorites = this.favoritePropertiesSubject.value;
    this.favoritePropertiesSubject.next(currentFavorites.filter(id => id !== propertyId));
    return of(true).pipe(delay(200));
  }

  scheduleVisit(propertyId: string, visitData: any): Observable<boolean> {
    // In a real app, this would make an API call
    console.log('Scheduling visit for property', propertyId, visitData);
    return of(true).pipe(delay(500));
  }

  contactOwner(propertyId: string, message: string): Observable<boolean> {
    // In a real app, this would make an API call
    console.log('Contacting owner for property', propertyId, message);
    return of(true).pipe(delay(500));
  }

  private loadMockProperties(): void {
    const mockProperties: Property[] = [
      {
        id: '1',
        title: 'Modern Downtown Apartment',
        description: 'Beautiful modern apartment in the heart of downtown with city views and premium amenities.',
        price: 2500,
        priceType: 'rent',
        currency: 'USD',
        location: {
          address: '123 Main Street',
          city: 'San Francisco',
          state: 'CA',
          zipCode: '94102',
          coordinates: {lat: 37.7749, lng: -122.4194}
        },
        propertyType: 'apartment',
        area: 1200,
        bedrooms: 2,
        bathrooms: 2,
        images: [
          'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg',
          'https://images.pexels.com/photos/1643383/pexels-photo-1643383.jpeg',
          'https://images.pexels.com/photos/1571453/pexels-photo-1571453.jpeg'
        ],
        amenities: ['Parking', 'Pool', 'Gym', 'Elevator', 'Balcony'],
        features: ['City View', 'Modern Kitchen', 'Hardwood Floors'],
        owner: {
          id: 'owner1',
          name: 'Sarah Johnson',
          avatar: 'https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?w=150',
          phone: '+1-555-0123',
          email: 'sarah@example.com'
        },
        isVerified: true,
        isFeatured: true,
        createdAt: new Date('2024-01-15'),
        updatedAt: new Date('2024-01-20'),
        status: 'available'
      },
      {
        id: '2',
        title: 'Luxury Family House',
        description: 'Spacious family home with garden, perfect for families looking for comfort and privacy.',
        price: 850000,
        priceType: 'sale',
        currency: 'USD',
        location: {
          address: '456 Oak Avenue',
          city: 'San Jose',
          state: 'CA',
          zipCode: '95123',
          coordinates: {lat: 37.3382, lng: -121.8863}
        },
        propertyType: 'house',
        area: 2800,
        bedrooms: 4,
        bathrooms: 3,
        images: [
          'https://images.pexels.com/photos/106399/pexels-photo-106399.jpeg',
          'https://images.pexels.com/photos/1396132/pexels-photo-1396132.jpeg',
          'https://images.pexels.com/photos/1115804/pexels-photo-1115804.jpeg'
        ],
        amenities: ['Garden', 'Garage', 'Fireplace', 'Patio'],
        features: ['Large Kitchen', 'Master Suite', 'Walk-in Closets'],
        owner: {
          id: 'owner2',
          name: 'Michael Chen',
          avatar: 'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?w=150',
          phone: '+1-555-0456',
          email: 'michael@example.com'
        },
        isVerified: true,
        isFeatured: false,
        createdAt: new Date('2024-01-10'),
        updatedAt: new Date('2024-01-18'),
        status: 'available'
      },
      {
        id: '3',
        title: 'Cozy Studio Apartment',
        description: 'Perfect starter home or investment property in a quiet neighborhood with easy access to transit.',
        price: 1800,
        priceType: 'rent',
        currency: 'USD',
        location: {
          address: '789 Pine Street',
          city: 'Oakland',
          state: 'CA',
          zipCode: '94612',
          coordinates: {lat: 37.8044, lng: -122.2711}
        },
        propertyType: 'apartment',
        area: 650,
        bedrooms: 1,
        bathrooms: 1,
        images: [
          'https://images.pexels.com/photos/1454804/pexels-photo-1454804.jpeg',
          'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg'
        ],
        amenities: ['Laundry', 'Storage', 'Pet Friendly'],
        features: ['Open Floor Plan', 'Large Windows', 'Updated Kitchen'],
        owner: {
          id: 'owner3',
          name: 'Emily Rodriguez',
          avatar: 'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?w=150',
          phone: '+1-555-0789',
          email: 'emily@example.com'
        },
        isVerified: true,
        isFeatured: false,
        createdAt: new Date('2024-01-12'),
        updatedAt: new Date('2024-01-19'),
        status: 'available'
      },
      {
        id: '4',
        title: 'Commercial Office Space',
        description: 'Prime commercial location with modern facilities, perfect for growing businesses.',
        price: 4500,
        priceType: 'rent',
        currency: 'USD',
        location: {
          address: '321 Business Blvd',
          city: 'San Francisco',
          state: 'CA',
          zipCode: '94105',
          coordinates: {lat: 37.7849, lng: -122.4094}
        },
        propertyType: 'commercial',
        area: 2000,
        bedrooms: 0,
        bathrooms: 2,
        images: [
          'https://images.pexels.com/photos/380769/pexels-photo-380769.jpeg',
          'https://images.pexels.com/photos/416320/pexels-photo-416320.jpeg'
        ],
        amenities: ['Parking', 'Elevator', 'Security', 'Conference Room'],
        features: ['High Ceilings', 'Natural Light', 'Modern Fixtures'],
        owner: {
          id: 'owner4',
          name: 'David Wilson',
          avatar: 'https://images.pexels.com/photos/91227/pexels-photo-91227.jpeg?w=150',
          phone: '+1-555-0321',
          email: 'david@example.com'
        },
        isVerified: true,
        isFeatured: true,
        createdAt: new Date('2024-01-08'),
        updatedAt: new Date('2024-01-16'),
        status: 'available'
      }
    ];

    this.propertiesSubject.next(mockProperties);
  }

  private filterProperties(properties: Property[], filters: PropertyFilter): Property[] {
    let filtered = [...properties];

    // Search query
    if (filters.search_key) {
      const query = filters.search_key.toLowerCase();
      filtered = filtered.filter(p =>
        p.title.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query) ||
        p.location.city.toLowerCase().includes(query) ||
        p.location.address.toLowerCase().includes(query)
      );
    }

    // Price type
    if (filters.priceType && filters.priceType !== 'all') {
      filtered = filtered.filter(p => p.priceType === filters.priceType);
    }

    // Price range
    if (filters.minPrice !== undefined) {
      filtered = filtered.filter(p => p.price >= filters.minPrice!);
    }
    if (filters.maxPrice !== undefined) {
      filtered = filtered.filter(p => p.price <= filters.maxPrice!);
    }

    // Property type
    if (filters.propertyType && filters.propertyType.length > 0) {
      filtered = filtered.filter(p => filters.propertyType!.includes(p.propertyType));
    }

    // Bedrooms
    if (filters.minBedrooms !== undefined) {
      filtered = filtered.filter(p => p.bedrooms >= filters.minBedrooms!);
    }
    if (filters.maxBedrooms !== undefined) {
      filtered = filtered.filter(p => p.bedrooms <= filters.maxBedrooms!);
    }

    // Bathrooms
    if (filters.minBathrooms !== undefined) {
      filtered = filtered.filter(p => p.bathrooms >= filters.minBathrooms!);
    }
    if (filters.maxBathrooms !== undefined) {
      filtered = filtered.filter(p => p.bathrooms <= filters.maxBathrooms!);
    }

    // Area
    if (filters.minArea !== undefined) {
      filtered = filtered.filter(p => p.area >= filters.minArea!);
    }
    if (filters.maxArea !== undefined) {
      filtered = filtered.filter(p => p.area <= filters.maxArea!);
    }

    // Amenities
    if (filters.amenities && filters.amenities.length > 0) {
      filtered = filtered.filter(p =>
        filters.amenities!.some(amenity => p.amenities.includes(amenity))
      );
    }

    // Sorting
    if (filters.sortBy) {
      filtered = this.sortProperties(filtered, filters.sortBy);
    }

    return filtered;
  }

  private sortProperties(properties: Property[], sortBy: string): Property[] {
    const sorted = [...properties];

    switch (sortBy) {
      case 'price-asc':
        return sorted.sort((a, b) => a.price - b.price);
      case 'price-desc':
        return sorted.sort((a, b) => b.price - a.price);
      case 'date-newest':
        return sorted.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      case 'date-oldest':
        return sorted.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      case 'area-asc':
        return sorted.sort((a, b) => a.area - b.area);
      case 'area-desc':
        return sorted.sort((a, b) => b.area - a.area);
      default:
        return sorted;
    }
  }
}
