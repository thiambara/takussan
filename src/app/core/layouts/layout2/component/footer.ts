import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {IconComponent} from '../../../../shared/components';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
      <!-- Footer -->
      <footer class="bg-gray-900 text-white py-12 mt-16">
          <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
                  <div>
                      <h3 class="text-xl font-bold mb-4">Takussan</h3>
                      <p class="text-gray-300 mb-4">Your trusted real estate platform connecting property owners,
                          tenants, and agents.</p>
                      <div class="flex space-x-4">
                          <a href="#" class="text-gray-300 hover:text-white">
                              <span class="sr-only">Twitter</span>
                              <app-icon name="twitter" [size]="6"/>
                          </a>
                          <a href="#" class="text-gray-300 hover:text-white">
                              <span class="sr-only">Facebook</span>
                              <app-icon name="facebook" [size]="6"/>
                          </a>
                      </div>
                  </div>
                  <div>
                      <h4 class="font-semibold mb-4">For Buyers</h4>
                      <ul class="space-y-2 text-gray-300">
                          <li><a href="#" class="hover:text-white">Buy a Home</a></li>
                          <li><a href="#" class="hover:text-white">Rent a Home</a></li>
                          <li><a href="#" class="hover:text-white">Price Estimates</a></li>
                          <li><a href="#" class="hover:text-white">Neighborhood Guide</a></li>
                      </ul>
                  </div>
                  <div>
                      <h4 class="font-semibold mb-4">For Sellers</h4>
                      <ul class="space-y-2 text-gray-300">
                          <li><a href="#" class="hover:text-white">Sell Your Home</a></li>
                          <li><a href="#" class="hover:text-white">List Your Property</a></li>
                          <li><a href="#" class="hover:text-white">Agent Directory</a></li>
                          <li><a href="#" class="hover:text-white">Market Reports</a></li>
                      </ul>
                  </div>
                  <div>
                      <h4 class="font-semibold mb-4">Support</h4>
                      <ul class="space-y-2 text-gray-300">
                          <li><a href="#" class="hover:text-white">Help Center</a></li>
                          <li><a href="#" class="hover:text-white">Contact Us</a></li>
                          <li><a href="#" class="hover:text-white">Terms of Service</a></li>
                          <li><a href="#" class="hover:text-white">Privacy Policy</a></li>
                      </ul>
                  </div>
              </div>
              <div class="border-t border-gray-800 mt-8 pt-8 text-center text-gray-300">
                  <p>&copy; 2024 Takussan. All rights reserved.</p>
              </div>
          </div>
      </footer>
  `,
  styles: [
    `
      header {
        position: sticky;
        top: 0;
        z-index: 10;
        background-color: white;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);

        @media (max-width: 768px) {
          padding: 0.75rem 1rem;
        }
      }

      // Animation for mobile menu
      .mobile-menu-enter {
        opacity: 0;
        transform: translateY(-10px);
      }

      .mobile-menu-enter-active {
        opacity: 1;
        transform: translateY(0);
        transition: opacity 200ms, transform 200ms;
      }

      .mobile-menu-exit {
        opacity: 1;
      }

      .mobile-menu-exit-active {
        opacity: 0;
        transform: translateY(-10px);
        transition: opacity 200ms, transform 200ms;
      }
    `
  ]
})
export class Footer {

}
