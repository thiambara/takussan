import {Component} from '@angular/core';
import {RouterModule} from '@angular/router';
import {CommonModule} from '@angular/common';
import {StyleClassModule} from 'primeng/styleclass';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterModule, CommonModule, StyleClassModule],
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
                              <svg class="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z"/>
                              </svg>
                          </a>
                          <a href="#" class="text-gray-300 hover:text-white">
                              <svg class="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M22.46 6c-.77.35-1.6.58-2.46.69.88-.53 1.56-1.37 1.88-2.38-.83.5-1.75.85-2.72 1.05C18.37 4.5 17.26 4 16 4c-2.35 0-4.27 1.92-4.27 4.29 0 .34.04.67.11.98C8.28 9.09 5.11 7.38 3 4.79c-.37.63-.58 1.37-.58 2.15 0 1.49.75 2.81 1.91 3.56-.71 0-1.37-.2-1.95-.5v.03c0 2.08 1.48 3.82 3.44 4.21a4.22 4.22 0 0 1-1.93.07 4.28 4.28 0 0 0 4 2.98 8.521 8.521 0 0 1-5.33 1.84c-.34 0-.68-.02-1.02-.06C3.44 20.29 5.7 21 8.12 21 16 21 20.33 14.46 20.33 8.79c0-.19 0-.37-.01-.56.84-.6 1.56-1.36 2.14-2.23z"/>
                              </svg>
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
