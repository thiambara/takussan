import {Component, inject, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {Property} from "../../core/models/http/property.model";
import {SelectButton} from "primeng/selectbutton";
import {Select} from "primeng/select";
import {ButtonModule} from "primeng/button";
import {IconField} from "primeng/iconfield";
import {InputIcon} from "primeng/inputicon";
import {InputText} from "primeng/inputtext";
import {PropertyService} from "../../core/services/http/property.service";
import {SelectItemGroup} from "primeng/api";
import {PropertyCardComponent} from "../../shared/components/product-card/property-card.component";

@Component({
  selector: 'app-homepage',
  standalone: true,
  imports: [CommonModule, FormsModule, SelectButton, Select, ButtonModule, IconField, InputIcon, InputText, PropertyCardComponent],
  templateUrl: './homepage.component.html',
  styleUrls: ['./homepage.component.scss']
})
export class HomepageComponent implements OnInit {
  propertyService = inject(PropertyService);
  // Search state
  searchMode: 'rent' | 'buy' = 'buy';
  selectedLocation = '';
  searchQuery = '';
  selectedPriceRange = '';

  suggestedLocations: SelectItemGroup[] = [];

  // Search mode options for SelectButton
  searchModeOptions = [
    {label: 'Acheter', value: 'buy', icon: 'pi pi-home'},
    {label: 'Louer', value: 'rent', icon: 'pi pi-key'}
  ];
  // Properties
  properties: Property[] = [];

  // Property categories
  propertyCategories = [
    {id: 'apartment', label: 'Appartements', icon: '🏢', active: false},
    {id: 'house', label: 'Maisons', icon: '🏠', active: false},
    {id: 'villa', label: 'Villas', icon: '🏡', active: false},
    {id: 'land', label: 'Terrains', icon: '🏞️', active: false},
    {id: 'office', label: 'Bureaux', icon: '🏢', active: false},
    {id: 'store', label: 'Commerces', icon: '🏪', active: false}
  ];
  activeCategory = 'all';

  // Price ranges based on search mode for PrimeNG dropdown
  get priceRangeOptions() {
    if (this.searchMode === 'rent') {
      return [
        {label: 'Tous les budgets', value: ''},
        {label: 'Moins de 100K FCFA', value: '0-100000'},
        {label: '100K - 200K FCFA', value: '100000-200000'},
        {label: '200K - 500K FCFA', value: '200000-500000'},
        {label: '500K - 1M FCFA', value: '500000-1000000'},
        {label: 'Plus de 1M FCFA', value: '1000000+'}
      ];
    } else {
      return [
        {label: 'Tous les budgets', value: ''},
        {label: 'Moins de 10M FCFA', value: '0-10000000'},
        {label: '10M - 25M FCFA', value: '10000000-25000000'},
        {label: '25M - 50M FCFA', value: '25000000-50000000'},
        {label: '50M - 100M FCFA', value: '50000000-100000000'},
        {label: '100M - 200M FCFA', value: '100000000-200000000'},
        {label: 'Plus de 200M FCFA', value: '200000000+'}
      ];
    }
  }

  ngOnInit() {
    this.selectedLocation = '';
    this.selectedPriceRange = '';
    this.search();
  }

  search() {
    console.log('Searching with PrimeNG:', {
      mode: this.searchMode,
      region: this.selectedLocation,
      priceRange: this.selectedPriceRange,
      query: this.searchQuery
    });

    // Implement actual search logic here
    // You can navigate to a search results page or filter current properties
    // Filter properties based on search criteria
    this.filterProperties();
  }

  selectCategory(categoryId: string) {
    this.activeCategory = categoryId;
    this.propertyCategories.forEach(cat => {
      cat.active = cat.id === categoryId;
    });
    // Filter properties based on category
  }


  searchLocation(event: any) {
    console.log(event)

  }

  filterProperties() {
    const params: any = {
      properties: {with: ['media']},
      search_query: this.searchQuery,
      page: 1,
      per_page: 12,
    };

    // Filter by property type
    if (this.activeCategory && this.activeCategory !== 'all') {
      params.property_type = this.activeCategory;
    }

    // Filter by search mode (rent/buy)
    params.contract_type = this.searchMode;

    this.propertyService.heroSearch(params).subscribe({
      next: (response: any) => {
        this.properties = response.data;
        console.log(this.properties)
      }
    });
  }

}
