import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {AccordionModule} from 'primeng/accordion';
import {RadioButtonModule} from 'primeng/radiobutton';
import {SelectButtonModule} from 'primeng/selectbutton';
import {SliderModule} from 'primeng/slider';
import {CheckboxModule} from 'primeng/checkbox';
import {ButtonModule} from 'primeng/button';
import {InputNumberModule} from 'primeng/inputnumber';
import {ChipModule} from 'primeng/chip';
import {BadgeModule} from 'primeng/badge';
// import {DropdownModule} from 'primeng/dropdown';
import {PropertyFilter} from "../../../pages/search-results/search-results.component";

@Component({
  selector: 'app-property-filters',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AccordionModule,
    RadioButtonModule,
    SelectButtonModule,
    SliderModule,
    CheckboxModule,
    ButtonModule,
    InputNumberModule,
    ChipModule,
    BadgeModule
  ],
  templateUrl: './property-filters.component.html',
  styleUrls: ['./property-filters.component.scss']
})
export class PropertyFiltersComponent implements OnInit {

  @Input() filters: PropertyFilter = {};
  @Output() filtersChange = new EventEmitter<PropertyFilter>();
  showAllAmenities = false;

  // For slider range
  priceRange: [number, number] = [0, 1000000];
  areaRange: [number, number] = [0, 5000];

  // Property types for checkboxes
  propertyTypeOptions = [
    {value: 'single-family', label: 'Single Family Home', count: 1247},
    {value: 'condo', label: 'Condo/Townhome', count: 892},
    {value: 'multi-family', label: 'Multi-Family', count: 143},
    {value: 'land', label: 'Land/Lot', count: 565}
  ];

  // Old property types for SelectButton (kept for compatibility)
  propertyTypes = [
    {value: 'apartment', label: 'Apartment', icon: 'pi pi-building'},
    {value: 'house', label: 'House', icon: 'pi pi-home'},
    {value: 'condo', label: 'Condo', icon: 'pi pi-th-large'},
    {value: 'commercial', label: 'Commercial', icon: 'pi pi-shopping-bag'},
    {value: 'land', label: 'Land', icon: 'pi pi-map'}
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

  // Price presets
  priceRanges = {
    rent: [
      {min: 0, max: 1000, label: 'Under $1,000'},
      {min: 1000, max: 2000, label: '$1,000 - $2,000'},
      {min: 2000, max: 3000, label: '$2,000 - $3,000'},
      {min: 3000, max: 5000, label: '$3,000 - $5,000'},
      {min: 5000, max: null, label: 'Over $5,000'}
    ],
    sale: [
      {min: 0, max: 200000, label: 'Under $200k'},
      {min: 200000, max: 500000, label: '$200k - $500k'},
      {min: 500000, max: 1000000, label: '$500k - $1M'},
      {min: 1000000, max: 2000000, label: '$1M - $2M'},
      {min: 2000000, max: null, label: 'Over $2M'}
    ]
  };

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

  get currentPriceRanges() {
    return this.filters.priceType === 'rent' ? this.priceRanges.rent : this.priceRanges.sale;
  }

  getPriceOptions(type: 'min' | 'max'): { value: number, label: string }[] {
    if (this.filters.priceType === 'rent') {
      return type === 'min' ? [
        {value: 100, label: '$100'},
        {value: 500, label: '$500'},
        {value: 1000, label: '$1,000'},
        {value: 1500, label: '$1,500'},
        {value: 2000, label: '$2,000'},
        {value: 2500, label: '$2,500'},
        {value: 3000, label: '$3,000'},
        {value: 4000, label: '$4,000'}
      ] : [
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
      return type === 'min' ? [
        {value: 100000, label: '$100K'},
        {value: 200000, label: '$200K'},
        {value: 300000, label: '$300K'},
        {value: 400000, label: '$400K'},
        {value: 500000, label: '$500K'},
        {value: 750000, label: '$750K'},
        {value: 1000000, label: '$1M'}
      ] : [
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

  ngOnInit() {
    if (this.filters.minPrice && this.filters.maxPrice) {
      this.priceRange = [this.filters.minPrice, this.filters.maxPrice];
    }
    if (this.filters.minArea && this.filters.maxArea) {
      this.areaRange = [this.filters.minArea, this.filters.maxArea];
    }
  }

  onPriceRangeChange() {
    this.filters.minPrice = this.priceRange[0];
    this.filters.maxPrice = this.priceRange[1];
    this.applyFilters();
  }

  onAreaRangeChange() {
    this.filters.minArea = this.areaRange[0];
    this.filters.maxArea = this.areaRange[1];
    this.applyFilters();
  }

  onPriceTypeChange() {
    // Reset price range when switching between rent and sale
    this.filters.minPrice = undefined;
    this.filters.maxPrice = undefined;
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

  setPriceRange(min: number | null, max: number | null) {
    this.filters.minPrice = min ?? undefined;
    this.filters.maxPrice = max ?? undefined;
    this.applyFilters();
  }

  applyFilters() {
    this.filtersChange.emit(this.filters);
  }

  clearAllFilters() {
    this.filters = {
      priceType: 'all',
      sortBy: 'date-newest'
    };
    this.applyFilters();
  }
}
