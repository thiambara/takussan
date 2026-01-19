import {Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {PropertyFilter} from "../../../core/models/property-filter.model";
import {LucideAngularModule, X} from 'lucide-angular';
import {SelectModule} from 'primeng/select';

@Component({
  selector: 'app-property-filters',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    LucideAngularModule,
    SelectModule
  ],
  templateUrl: './property-filters.component.html'
})
export class PropertyFiltersComponent implements OnInit, OnChanges {

  @Input() filters: PropertyFilter = {};
  @Output() filtersChange = new EventEmitter<PropertyFilter>();
  showAllAmenities = false;

  readonly X = X;

  minPriceOptions: { value: number, label: string }[] = [];
  maxPriceOptions: { value: number, label: string }[] = [];

  // Property types for checkboxes
  propertyTypeOptions = [
    {value: 'single-family', label: 'Single Family Home', count: 1247},
    {value: 'condo', label: 'Condo/Townhome', count: 892},
    {value: 'multi-family', label: 'Multi-Family', count: 143},
    {value: 'land', label: 'Land/Lot', count: 565}
  ];

  // Listing type options
  listingTypes = [
    {label: 'All', value: 'all'},
    {label: 'For Rent', value: 'rent'},
    {label: 'For Sale', value: 'sale'}
  ];

  // Bedroom options for SelectButton
  bedroomOptions = [
    {label: '1', value: 1},
    {label: '2', value: 2},
    {label: '3', value: 3},
    {label: '4+', value: 4}
  ];

  // Bathroom options for SelectButton
  bathroomOptions = [
    {label: '1', value: 1},
    {label: '2', value: 2},
    {label: '3', value: 3},
    {label: '4+', value: 4}
  ];

  // Available amenities
  amenities = [
    'Parking',
    'Pool',
    'Gym',
    'Elevator',
    'Balcony',
    'Garden',
    'Garage',
    'Fireplace',
    'Patio',
    'Laundry',
    'Storage',
    'Pet Friendly',
    'Security',
    'Conference Room'
  ];

  ngOnInit() {
    this.updatePriceOptions();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['filters']) {
      this.updatePriceOptions();
    }
  }

  get activeFiltersCount(): number {
    let count = 0;
    if (this.filters.priceType && this.filters.priceType !== 'all') count++;
    if (this.filters.propertyType?.length) count += this.filters.propertyType.length;
    if (this.filters.minPrice !== undefined || this.filters.maxPrice !== undefined) count++;
    if (this.filters.minBedrooms !== undefined || this.filters.maxBedrooms !== undefined) count++;
    if (this.filters.minBathrooms !== undefined || this.filters.maxBathrooms !== undefined) count++;
    if (this.filters.minArea !== undefined || this.filters.maxArea !== undefined) count++;
    if (this.filters.amenities?.length) count += this.filters.amenities.length;
    return count;
  }

  updatePriceOptions() {
    if (this.filters.priceType === 'rent') {
      this.minPriceOptions = [
        {value: 100, label: '$100'},
        {value: 500, label: '$500'},
        {value: 1000, label: '$1,000'},
        {value: 1500, label: '$1,500'},
        {value: 2000, label: '$2,000'},
        {value: 2500, label: '$2,500'},
        {value: 3000, label: '$3,000'},
        {value: 4000, label: '$4,000'}
      ];
      this.maxPriceOptions = [
        {value: 1000, label: '$1,000'},
        {value: 1500, label: '$1,500'},
        {value: 2000, label: '$2,000'},
        {value: 2500, label: '$2,500'},
        {value: 3000, label: '$3,000'},
        {value: 4000, label: '$4,000'},
        {value: 5000, label: '$5,000'},
        {value: 10000, label: '$10,000'}
      ];
    } else {
      this.minPriceOptions = [
        {value: 100000, label: '$100K'},
        {value: 200000, label: '$200K'},
        {value: 300000, label: '$300K'},
        {value: 400000, label: '$400K'},
        {value: 500000, label: '$500K'},
        {value: 750000, label: '$750K'},
        {value: 1000000, label: '$1M'}
      ];
      this.maxPriceOptions = [
        {value: 300000, label: '$300K'},
        {value: 400000, label: '$400K'},
        {value: 500000, label: '$500K'},
        {value: 750000, label: '$750K'},
        {value: 1000000, label: '$1M'},
        {value: 1500000, label: '$1.5M'},
        {value: 2000000, label: '$2M'}
      ];
    }
  }

  onPriceTypeChange() {
    // Reset price range when switching between rent and sale
    this.filters.minPrice = undefined;
    this.filters.maxPrice = undefined;
    this.updatePriceOptions();
    this.applyFilters();
  }

  togglePropertyType(type: string) {
    if (!this.filters.propertyType) {
      this.filters.propertyType = [];
    }

    const index = this.filters.propertyType.indexOf(type);
    if (index > -1) {
      this.filters.propertyType.splice(index, 1);
    } else {
      this.filters.propertyType.push(type);
    }

    this.applyFilters();
  }

  isPropertyTypeSelected(type: string): boolean {
    return this.filters.propertyType?.includes(type) || false;
  }

  toggleAmenity(amenity: string) {
    if (!this.filters.amenities) {
      this.filters.amenities = [];
    }

    const index = this.filters.amenities.indexOf(amenity);
    if (index > -1) {
      this.filters.amenities.splice(index, 1);
    } else {
      this.filters.amenities.push(amenity);
    }

    this.applyFilters();
  }

  isAmenitySelected(amenity: string): boolean {
    return this.filters.amenities?.includes(amenity) || false;
  }

  applyFilters() {
    this.filtersChange.emit(this.filters);
  }

  clearAllFilters() {
    this.filters = {
      priceType: 'all',
      sortBy: 'date-newest'
    };
    this.updatePriceOptions();
    this.applyFilters();
  }
}
