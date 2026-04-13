import {Component, inject, OnInit} from '@angular/core';

import {FormsModule} from '@angular/forms';
import {Router} from '@angular/router';
import {Property} from "../../core/models/http/property.model";
import {PropertyService} from "../../core/services/http/property.service";
import {PropertyCardComponent} from "../../shared/components/property-card/property-card.component";
import {HeroSearchComponent, SearchFilters} from "../../shared/components/hero-search/hero-search.component";
import {Briefcase, Building2, House, LucideAngularModule, Map, Store, TreePalm} from 'lucide-angular';

@Component({
  selector: 'app-homepage',
  standalone: true,
  imports: [
    FormsModule,
    PropertyCardComponent,
    LucideAngularModule,
    HeroSearchComponent
],
  templateUrl: './homepage.component.html'
})
export class HomepageComponent implements OnInit {
  propertyService = inject(PropertyService);
  // Search state
  searchMode: 'rent' | 'sale' = 'sale';
  loading = false;
  // Properties
  properties: Property[] = [];
  // Property categories
  propertyCategories = [
    {id: 'apartment', label: 'Appartements', icon: Building2, active: false},
    {id: 'house', label: 'Maisons', icon: House, active: false},
    {id: 'villa', label: 'Villas', icon: TreePalm, active: false},
    {id: 'land', label: 'Terrains', icon: Map, active: false},
    {id: 'office', label: 'Bureaux', icon: Briefcase, active: false},
    {id: 'store', label: 'Commerces', icon: Store, active: false}
  ];
  activeCategory = 'all';
  private router = inject(Router);

  ngOnInit() {
    this.filterProperties();
  }

  selectCategory(categoryId: string) {
    this.activeCategory = categoryId;
    this.propertyCategories.forEach(cat => {
      cat.active = cat.id === categoryId;
    });
    this.filterProperties();
  }

  handleSearch(filters: SearchFilters) {
    const queryParams: any = {};

    if (filters.query) {
      queryParams.q = filters.query;
    }

    if (filters.mode) {
      queryParams.type = filters.mode === 'buy' ? 'sale' : 'rent';
    }

    if (filters.address) {
      queryParams.location = filters.address;
    }

    if (filters.propertyType) {
      queryParams.propertyType = filters.propertyType;
    }

    this.router.navigate(['/search'], {queryParams}).then();
  }

  filterProperties() {
    const params: any = {
      properties: {with: ['media']},
      page: 1,
      per_page: 10,
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
      }
    });
  }

  onPropertyClick(property: Property) {
    this.router.navigate(['/show-property', property.id]).then();
  }

  onFavoriteToggle(property: Property) {
    // Implement favorite toggle logic here
  }

}
