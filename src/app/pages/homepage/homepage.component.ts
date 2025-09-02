import {Component, inject, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {Property} from "../../core/models/http/property.model";
import {PropertyService} from "../../core/services/http/property.service";

@Component({
  selector: 'app-homepage',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './homepage.component.html',
  styleUrls: ['./homepage.component.scss']
})
export class HomepageComponent implements OnInit {
  private propertyService = inject(PropertyService);
  
  // Search state
  searchMode: 'rent' | 'buy' = 'buy';
  selectedRegion = '';
  searchQuery = '';
  showRegionDropdown = false;
  
  // Available regions (you can populate this from backend)
  regions = [
    'Dakar',
    'Thiès', 
    'Saint-Louis',
    'Diourbel',
    'Louga',
    'Fatick',
    'Kaolack',
    'Matam',
    'Kaffrine',
    'Kédougou',
    'Kolda',
    'Sédhiou',
    'Tambacounda',
    'Ziguinchor'
  ];
  
  filteredRegions: string[] = [];
  
  // Properties
  properties: Property[] = [];
  featuredProperties: Property[] = [];
  
  // Property categories
  propertyCategories = [
    { id: 'apartment', label: 'Appartements', icon: '🏢', active: false },
    { id: 'house', label: 'Maisons', icon: '🏠', active: false },
    { id: 'villa', label: 'Villas', icon: '🏡', active: false },
    { id: 'land', label: 'Terrains', icon: '🏞️', active: false },
    { id: 'office', label: 'Bureaux', icon: '🏢', active: false },
    { id: 'store', label: 'Commerces', icon: '🏪', active: false }
  ];
  
  activeCategory = 'all';
  
  ngOnInit() {
    this.loadProperties();
    this.filteredRegions = [...this.regions];
  }
  
  loadProperties() {
    // Mock data for now - replace with actual API call
    this.properties = this.generateMockProperties();
    this.featuredProperties = this.properties.slice(0, 8);
  }
  
  filterRegions() {
    const query = this.selectedRegion.toLowerCase();
    this.filteredRegions = this.regions.filter(region => 
      region.toLowerCase().includes(query)
    );
    this.showRegionDropdown = true;
  }
  
  selectRegion(region: string) {
    this.selectedRegion = region;
    this.showRegionDropdown = false;
  }
  
  toggleSearchMode(mode: 'rent' | 'buy') {
    this.searchMode = mode;
  }
  
  search() {
    console.log('Searching:', {
      mode: this.searchMode,
      region: this.selectedRegion,
      query: this.searchQuery
    });
    // Implement actual search logic here
  }
  
  selectCategory(categoryId: string) {
    this.activeCategory = categoryId;
    this.propertyCategories.forEach(cat => {
      cat.active = cat.id === categoryId;
    });
    // Filter properties based on category
  }
  
  formatPrice(price: number | undefined): string {
    if (!price) return '0';
    return new Intl.NumberFormat('fr-FR').format(price);
  }
  
  private generateMockProperties(): Property[] {
    const mockProperties: Property[] = [];
    const titles = [
      'Villa moderne avec vue sur mer',
      'Appartement luxueux en centre-ville',
      'Maison traditionnelle rénovée',
      'Terrain constructible bien situé',
      'Bureau moderne avec parking',
      'Commerce en plein centre commercial',
      'Villa avec piscine',
      'Studio meublé proche université'
    ];
    
    const descriptions = [
      'Magnifique propriété avec toutes les commodités modernes',
      'Emplacement idéal pour investissement locatif',
      'Propriété exceptionnelle dans un quartier calme',
      'Opportunité unique à saisir rapidement'
    ];
    
    const types = ['apartment', 'house', 'villa', 'land', 'office', 'store'];
    const regions = ['Dakar', 'Thiès', 'Saint-Louis', 'Diourbel'];
    
    for (let i = 0; i < 24; i++) {
      mockProperties.push({
        id: i + 1,
        title: titles[i % titles.length],
        description: descriptions[i % descriptions.length],
        type: types[i % types.length],
        price: Math.floor(Math.random() * 500000000) + 50000000,
        area: Math.floor(Math.random() * 500) + 50,
        status: 'available',
        contract_type: i % 2 === 0 ? 'sale' : 'rent',
        address: {
          city: regions[i % regions.length],
          country: 'Sénégal',
          neighborhood: 'Centre-ville'
        },
        media: [
          {
            id: i,
            original_url: `https://source.unsplash.com/800x600/?house,villa,apartment&sig=${i}`,
            preview_url: `https://source.unsplash.com/800x600/?house,villa,apartment&sig=${i}`,
            thumbnail_url: `https://source.unsplash.com/400x300/?house,villa,apartment&sig=${i}`,
            mime_type: 'image/jpeg',
            is_image: true
          }
        ]
      } as Property);
    }
    
    return mockProperties;
  }
}
