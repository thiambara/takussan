import {Component, EventEmitter, Input, OnDestroy, OnInit, Output} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {debounceTime, distinctUntilChanged, Subject} from 'rxjs';

export interface SearchFilters {
  mode: 'buy' | 'rent';
  address: string;
  propertyType: string;
  query: string;
}

export interface AddressSuggestion {
  id: string;
  label: string;
  description?: string;
  coordinates?: { lat: number; lng: number };
}

export interface PropertyType {
  value: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-hero-search',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
  ],
  templateUrl: './hero-search.component.html',
  styleUrls: ['./hero-search.component.scss']
})
export class HeroSearchComponent implements OnInit, OnDestroy {
  @Input() placeholder = "Mots-clés, quartier, ville...";
  @Input() addressPlaceholder = "Où cherchez-vous ?";
  @Input() initialMode: 'buy' | 'rent' = 'buy';

  @Output() onSearch = new EventEmitter<SearchFilters>();
  @Output() onAddressChange = new EventEmitter<string>();
  @Output() onPropertyTypeChange = new EventEmitter<string>();

  // Component state
  searchMode: 'buy' | 'rent' = 'buy';
  address = '';
  propertyType = '';
  searchQuery = '';

  // Focus states
  isSearchFocused = false;
  isAddressFocused = false;
  isPropertyTypeFocused = false;
  activeField: string | null = null;

  // Address autocomplete
  addressSuggestions: AddressSuggestion[] = [];
  isLoadingAddresses = false;
  showAddressSuggestions = false;

  // Property types
  propertyTypes: PropertyType[] = [
    {value: '', label: 'Tous types', icon: '🏠'},
    {value: 'apartment', label: 'Appartement', icon: '🏢'},
    {value: 'villa', label: 'Villa', icon: '🏘️'},
    {value: 'house', label: 'Maison', icon: '🏡'},
    {value: 'land', label: 'Terrain', icon: '🌱'},
    {value: 'office', label: 'Bureau', icon: '🏢'},
    {value: 'commercial', label: 'Local commercial', icon: '🏪'},
    {value: 'warehouse', label: 'Entrepôt', icon: '🏭'}
  ];

  // Quick suggestions
  quickSuggestions = [
    'Appartement 3 pièces',
    'Villa avec piscine',
    'Terrain constructible',
    'Bureau moderne',
    'Local commercial'
  ];

  // Subjects for debouncing
  private addressSearchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

  ngOnInit() {
    this.searchMode = this.initialMode;

    // Setup address search debouncing
    this.addressSearchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(searchTerm => {
      this.searchAddresses(searchTerm);
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleSearchMode(mode: 'buy' | 'rent') {
    if (this.searchMode !== mode) {
      this.searchMode = mode;
    }
  }

  // Focus management
  onFieldFocus(field: string) {
    this.activeField = field;
    switch (field) {
      case 'address':
        this.isAddressFocused = true;
        if (this.address.length >= 2) {
          this.showAddressSuggestions = true;
        }
        break;
      case 'propertyType':
        this.isPropertyTypeFocused = true;
        break;
      case 'search':
        this.isSearchFocused = true;
        break;
    }
  }

  onFieldBlur(field: string) {
    // Small delay to allow for clicking suggestions
    setTimeout(() => {
      this.activeField = null;
      switch (field) {
        case 'address':
          this.isAddressFocused = false;
          this.showAddressSuggestions = false;
          break;
        case 'propertyType':
          this.isPropertyTypeFocused = false;
          break;
        case 'search':
          this.isSearchFocused = false;
          break;
      }
    }, 200);
  }

  onAddressInput(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.address = value;
    this.onAddressChange.emit(value);

    if (value.length >= 2) {
      this.addressSearchSubject.next(value);
      this.showAddressSuggestions = true;
    } else {
      this.showAddressSuggestions = false;
      this.addressSuggestions = [];
    }
  }

  onPropertyTypeChangeHandler(value: string) {
    this.propertyType = value;
    this.onPropertyTypeChange.emit(value);
  }

  selectAddressSuggestion(suggestion: AddressSuggestion) {
    this.address = suggestion.label;
    this.showAddressSuggestions = false;
    this.onAddressChange.emit(suggestion.label);
  }

  executeSearch() {
    const filters: SearchFilters = {
      mode: this.searchMode,
      address: this.address.trim(),
      propertyType: this.propertyType,
      query: this.searchQuery.trim()
    };

    this.onSearch.emit(filters);
  }

  clearAddress() {
    this.address = '';
    this.showAddressSuggestions = false;
    this.onAddressChange.emit('');
  }

  clearSearch() {
    this.searchQuery = '';
  }

  clearPropertyType() {
    this.propertyType = '';
    this.onPropertyTypeChange.emit('');
  }

  // Get selected property type for display
  getSelectedPropertyType(): PropertyType {
    return this.propertyTypes.find(pt => pt.value === this.propertyType) || this.propertyTypes[0];
  }

  // Apply quick suggestion
  applyQuickSuggestion(suggestion: string) {
    this.searchQuery = suggestion;
    // Auto-focus the search field
    setTimeout(() => {
      this.onFieldFocus('search');
    }, 100);
  }

  // TrackBy function for better performance
  trackBySuggestionId(index: number, item: AddressSuggestion): string {
    return item.id;
  }

  trackByPropertyType(index: number, item: PropertyType): string {
    return item.value;
  }

  private async searchAddresses(term: string) {
    if (!term || term.length < 2) {
      this.addressSuggestions = [];
      return;
    }

    this.isLoadingAddresses = true;

    try {
      const response = await this.mockAddressSearch(term);
      this.addressSuggestions = response;
    } catch (error) {
      console.error('Error searching addresses:', error);
      this.addressSuggestions = [];
    } finally {
      this.isLoadingAddresses = false;
    }
  }

  private async mockAddressSearch(term: string): Promise<AddressSuggestion[]> {
    return new Promise(resolve => {
      setTimeout(() => {
        const mockSuggestions: AddressSuggestion[] = [
          {
            id: '1',
            label: `${term}, Dakar, Sénégal`,
            description: 'Dakar, Région de Dakar'
          },
          {
            id: '2',
            label: `${term}, Thiès, Sénégal`,
            description: 'Thiès, Région de Thiès'
          },
          {
            id: '3',
            label: `${term}, Saint-Louis, Sénégal`,
            description: 'Saint-Louis, Région de Saint-Louis'
          },
          {
            id: '4',
            label: `${term}, Kaolack, Sénégal`,
            description: 'Kaolack, Région de Kaolack'
          }
        ];
        resolve(mockSuggestions.filter(s =>
          s.label.toLowerCase().includes(term.toLowerCase())
        ));
      }, 300);
    });
  }
}
