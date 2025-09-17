import {Component, inject, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {ActivatedRoute, Router} from '@angular/router';
import {Property} from '../../core/models/http/property.model';
import {PropertyCardComponent} from '../../shared/components/product-card/property-card.component';
import {PropertyFiltersComponent} from '../../shared/components/property-filters/property-filters.component';
import {debounceTime, distinctUntilChanged, finalize} from 'rxjs/operators';
import {Subject} from 'rxjs';
import {PropertyService} from '../../core/services/http/property.service';
import {PaginationResult} from '../../core/models/http/base/pagination-result.model';

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

@Component({
  selector: 'app-search-results',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    PropertyCardComponent,
    PropertyFiltersComponent
  ],
  templateUrl: './search-results.component.html'
})
export class SearchResultsComponent implements OnInit {
  viewMode: 'grid' | 'list' = 'grid';
  filteredProperties: Property[] = [];
  loading = false;
  filters: PropertyFilter = {};
  searchSubject = new Subject<string>();
  // Pagination
  currentPage = 1;
  itemsPerPage = 32;
  totalItems = 0;
  // Mobile filter drawer
  showMobileFilters = false;
  // Sorting options
  sortOptions = [
    {value: 'price-asc', label: 'Price: Low to High'},
    {value: 'price-desc', label: 'Price: High to Low'},
    {value: 'date-newest', label: 'Newest First'},
    {value: 'date-oldest', label: 'Oldest First'},
    {value: 'area-asc', label: 'Area: Small to Large'},
    {value: 'area-desc', label: 'Area: Large to Small'}
  ];
  private propertyService = inject(PropertyService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  get totalPages(): number {
    return Math.ceil(this.totalItems / this.itemsPerPage);
  }

  get pageNumbers(): number[] {
    const pages: number[] = [];
    const maxPages = 5;
    let start = Math.max(1, this.currentPage - Math.floor(maxPages / 2));
    let end = Math.min(this.totalPages, start + maxPages - 1);

    if (end - start + 1 < maxPages) {
      start = Math.max(1, end - maxPages + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    return pages;
  }

  ngOnInit() {
    // Get query params
    this.route.queryParams.subscribe(params => {
      this.filters = {
        searchQuery: params['q'] || '',
        priceType: params['type'] || 'all',
        propertyType: params['propertyType'] ? params['propertyType'].split(',') : [],
        minPrice: params['minPrice'] ? +params['minPrice'] : undefined,
        maxPrice: params['maxPrice'] ? +params['maxPrice'] : undefined,
        minBedrooms: params['minBedrooms'] ? +params['minBedrooms'] : undefined,
        maxBedrooms: params['maxBedrooms'] ? +params['maxBedrooms'] : undefined,
        minBathrooms: params['minBathrooms'] ? +params['minBathrooms'] : undefined,
        maxBathrooms: params['maxBathrooms'] ? +params['maxBathrooms'] : undefined,
        minArea: params['minArea'] ? +params['minArea'] : undefined,
        maxArea: params['maxArea'] ? +params['maxArea'] : undefined,
        amenities: params['amenities'] ? params['amenities'].split(',') : [],
        sortBy: params['sortBy'] || 'date-newest'
      };

      this.loadProperties();
    });

    // Setup search debounce
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(searchQuery => {
      this.filters.searchQuery = searchQuery;
      this.updateQueryParams();
    });
  }

  loadProperties() {
    this.loading = true;
    const params = {
      properties: {with: ['media']},
      per_page: this.itemsPerPage,
      page: this.currentPage,
      ...this.filters
    };
    this.propertyService.heroSearch(params)
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: (properties: any) => {
          this.filteredProperties = (properties as PaginationResult<Property>).data;
          this.totalItems = (properties as PaginationResult<Property>).total;
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading properties:', error);
          this.loading = false;
        }
      });
  }

  onFiltersChange(filters: PropertyFilter) {
    this.filters = {...this.filters, ...filters};
    this.currentPage = 1;
    this.updateQueryParams();
  }

  onSearchInput(event: Event) {
    const query = (event.target as HTMLInputElement).value;
    this.searchSubject.next(query);
  }

  onSortChange(event: Event) {
    this.filters.sortBy = (event.target as HTMLSelectElement).value as any;
    this.updateQueryParams();
  }

  toggleMobileFilters() {
    this.showMobileFilters = !this.showMobileFilters;
  }

  toggleViewMode() {
    this.viewMode = this.viewMode === 'grid' ? 'list' : 'grid';
  }

  onPageChange(page: number) {
    this.currentPage = page;
    this.loadProperties();
    window.scrollTo({top: 0, behavior: 'smooth'});
  }

  clearFilters() {
    this.filters = {
      searchQuery: '',
      priceType: 'all',
      sortBy: 'date-newest'
    };
    this.updateQueryParams();
  }

  removePropertyType(type: string) {
    if (this.filters.propertyType) {
      this.filters.propertyType = this.filters.propertyType.filter(t => t !== type);
      this.onFiltersChange(this.filters);
    }
  }

  onPropertyClick(property: Property) {
    this.router.navigate(['/client/properties', property.id]).then();
  }

  onFavoriteToggle(property: Property) {
    // Implement favorite toggle logic here
    console.log('Toggle favorite for property:', property.id);
  }

  onScheduleVisit(property: Property) {
    // Implement schedule visit logic here
    console.log('Schedule visit for property:', property.id);
    this.router.navigate(['/client/properties', property.id, 'visit']).then();
  }

  onChat(property: Property) {
    // Implement chat logic here
    console.log('Open chat for property:', property.id);
    this.router.navigate(['/client/properties', property.id, 'contact']).then();
  }

  private updateQueryParams() {
    const queryParams: any = {};

    if (this.filters.searchQuery) queryParams.q = this.filters.searchQuery;
    if (this.filters.priceType && this.filters.priceType !== 'all') queryParams.type = this.filters.priceType;
    if (this.filters.propertyType?.length) queryParams.propertyType = this.filters.propertyType.join(',');
    if (this.filters.minPrice !== undefined) queryParams.minPrice = this.filters.minPrice;
    if (this.filters.maxPrice !== undefined) queryParams.maxPrice = this.filters.maxPrice;
    if (this.filters.minBedrooms !== undefined) queryParams.minBedrooms = this.filters.minBedrooms;
    if (this.filters.maxBedrooms !== undefined) queryParams.maxBedrooms = this.filters.maxBedrooms;
    if (this.filters.minBathrooms !== undefined) queryParams.minBathrooms = this.filters.minBathrooms;
    if (this.filters.maxBathrooms !== undefined) queryParams.maxBathrooms = this.filters.maxBathrooms;
    if (this.filters.minArea !== undefined) queryParams.minArea = this.filters.minArea;
    if (this.filters.maxArea !== undefined) queryParams.maxArea = this.filters.maxArea;
    if (this.filters.amenities?.length) queryParams.amenities = this.filters.amenities.join(',');
    if (this.filters.sortBy) queryParams.sortBy = this.filters.sortBy;

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge'
    }).then();
  }
}
