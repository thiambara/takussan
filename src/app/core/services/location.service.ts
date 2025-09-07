// src/app/core/services/location.service.ts
import {Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {BehaviorSubject, debounceTime, distinctUntilChanged, Observable, of, switchMap} from 'rxjs';
import {catchError, map} from 'rxjs/operators';

export interface LocationSuggestion {
  id: string;
  name: string;
  fullAddress: string;
  city: string;
  postalCode?: string;
  region?: string;
  country: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  type: 'city' | 'district' | 'street' | 'postal_code';
}

export interface GeocodeResponse {
  features: Array<{
    properties: {
      id: string;
      name: string;
      label: string;
      city?: string;
      postcode?: string;
      context?: string;
      type: string;
    };
    geometry: {
      coordinates: [number, number];
    };
  }>;
}

@Injectable({
  providedIn: 'root'
})
export class LocationService {
  private readonly API_BASE_URL = 'https://api-adresse.data.gouv.fr';
  private searchSubject = new BehaviorSubject<string>('');

  // Cache pour éviter les appels API répétés
  private cache = new Map<string, LocationSuggestion[]>();

  constructor(private http: HttpClient) {
    this.initializeSearch();
  }

  /**
   * Recherche d'adresses avec autocomplétion
   */
  searchAddresses(query: string): Observable<LocationSuggestion[]> {
    if (!query || query.length < 2) {
      return of([]);
    }

    // Vérifier le cache
    const cachedResults = this.cache.get(query.toLowerCase());
    if (cachedResults) {
      return of(cachedResults);
    }

    return this.performSearch(query);
  }

  /**
   * Géolocalisation inverse (coordonnées -> adresse)
   */
  reverseGeocode(lat: number, lng: number): Observable<LocationSuggestion | null> {
    const params = {
      lat: lat.toString(),
      lon: lng.toString(),
      limit: '1'
    };

    return this.http.get<GeocodeResponse>(`${this.API_BASE_URL}/reverse`, {params})
      .pipe(
        map(response => {
          if (response.features && response.features.length > 0) {
            return this.transformResponse(response)[0];
          }
          return null;
        }),
        catchError(() => of(null))
      );
  }

  /**
   * Obtenir la position actuelle de l'utilisateur
   */
  getCurrentLocation(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Géolocalisation non supportée'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        resolve,
        reject,
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000 // 5 minutes
        }
      );
    });
  }

  /**
   * Obtenir l'adresse actuelle de l'utilisateur
   */
  async getCurrentAddress(): Promise<LocationSuggestion | null> {
    try {
      const position = await this.getCurrentLocation();
      const address = await this.reverseGeocode(
        position.coords.latitude,
        position.coords.longitude
      ).toPromise();
      return address || null;
    } catch (error) {
      console.warn('Impossible d\'obtenir la localisation actuelle:', error);
      return null;
    }
  }

  /**
   * Nettoyer le cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Valider une adresse
   */
  validateAddress(address: string): Observable<boolean> {
    return this.searchAddresses(address).pipe(
      map(suggestions => suggestions.length > 0)
    );
  }

  /**
   * Obtenir les suggestions populaires
   */
  getPopularLocations(): LocationSuggestion[] {
    return [
      {
        id: 'paris',
        name: 'Paris',
        fullAddress: 'Paris, Île-de-France, France',
        city: 'Paris',
        postalCode: '75000',
        region: 'Île-de-France',
        country: 'France',
        type: 'city'
      },
      {
        id: 'lyon',
        name: 'Lyon',
        fullAddress: 'Lyon, Auvergne-Rhône-Alpes, France',
        city: 'Lyon',
        postalCode: '69000',
        region: 'Auvergne-Rhône-Alpes',
        country: 'France',
        type: 'city'
      },
      {
        id: 'marseille',
        name: 'Marseille',
        fullAddress: 'Marseille, Provence-Alpes-Côte d\'Azur, France',
        city: 'Marseille',
        postalCode: '13000',
        region: 'Provence-Alpes-Côte d\'Azur',
        country: 'France',
        type: 'city'
      }
    ];
  }

  private initializeSearch() {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(query => this.performSearch(query))
    ).subscribe();
  }

  private performSearch(query: string): Observable<LocationSuggestion[]> {
    if (!query || query.length < 2) {
      return of([]);
    }

    const params = {
      q: query,
      type: 'municipality,locality,street,housenumber',
      limit: '10',
      autocomplete: '1'
    };

    return this.http.get<GeocodeResponse>(`${this.API_BASE_URL}/search`, {params})
      .pipe(
        map(response => this.transformResponse(response)),
        catchError(() => {
          // En cas d'erreur, retourner des suggestions par défaut
          return of(this.getDefaultSuggestions(query));
        })
      );
  }

  private transformResponse(response: GeocodeResponse): LocationSuggestion[] {
    return response.features.map(feature => {
      const props = feature.properties;
      const coords = feature.geometry.coordinates;

      return {
        id: props.id,
        name: this.extractCityName(props.name, props.label),
        fullAddress: props.label,
        city: props.city || this.extractCityName(props.name, props.label),
        postalCode: props.postcode,
        region: this.extractRegion(props.context),
        country: 'France',
        coordinates: {
          lat: coords[1],
          lng: coords[0]
        },
        type: this.mapAddressType(props.type)
      };
    });
  }

  private extractCityName(name: string, label: string): string {
    // Extraire le nom de la ville depuis le libellé
    if (name) return name;
    const parts = label.split(',');
    return parts[0].trim();
  }

  private extractRegion(context: string | undefined): string | undefined {
    if (!context) return undefined;
    const parts = context.split(',');
    return parts[parts.length - 1]?.trim();
  }

  private mapAddressType(apiType: string): LocationSuggestion['type'] {
    switch (apiType) {
      case 'municipality':
        return 'city';
      case 'locality':
        return 'district';
      case 'street':
        return 'street';
      case 'housenumber':
        return 'street';
      default:
        return 'city';
    }
  }

  /**
   * Suggestions par défaut en cas d'erreur API
   */
  private getDefaultSuggestions(query: string): LocationSuggestion[] {
    const defaultCities = [
      {name: 'Paris', region: 'Île-de-France', postalCode: '75000'},
      {name: 'Lyon', region: 'Auvergne-Rhône-Alpes', postalCode: '69000'},
      {name: 'Marseille', region: 'Provence-Alpes-Côte d\'Azur', postalCode: '13000'},
      {name: 'Toulouse', region: 'Occitanie', postalCode: '31000'},
      {name: 'Nice', region: 'Provence-Alpes-Côte d\'Azur', postalCode: '06000'},
      {name: 'Nantes', region: 'Pays de la Loire', postalCode: '44000'},
      {name: 'Strasbourg', region: 'Grand Est', postalCode: '67000'},
      {name: 'Montpellier', region: 'Occitanie', postalCode: '34000'},
      {name: 'Bordeaux', region: 'Nouvelle-Aquitaine', postalCode: '33000'},
      {name: 'Lille', region: 'Hauts-de-France', postalCode: '59000'}
    ];

    return defaultCities
      .filter(city => city.name.toLowerCase().includes(query.toLowerCase()))
      .map(city => ({
        id: city.name.toLowerCase(),
        name: city.name,
        fullAddress: `${city.name}, ${city.region}, France`,
        city: city.name,
        postalCode: city.postalCode,
        region: city.region,
        country: 'France',
        type: 'city' as const
      }));
  }
}
