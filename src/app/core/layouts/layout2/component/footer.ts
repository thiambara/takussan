import {Component} from '@angular/core';

import {LucideAngularModule, Twitter, Facebook} from 'lucide-angular';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [LucideAngularModule],
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
                          <a href="#" class="text-gray-300 hover:text-white transition-colors">
                              <span class="sr-only">Twitter</span>
                              <lucide-icon [img]="Twitter" class="w-6 h-6"></lucide-icon>
                          </a>
                          <a href="#" class="text-gray-300 hover:text-white transition-colors">
                              <span class="sr-only">Facebook</span>
                              <lucide-icon [img]="Facebook" class="w-6 h-6"></lucide-icon>
                          </a>
                      </div>
                  </div>
                  <div>
                      <h4 class="font-semibold mb-4">For Buyers</h4>
                      <ul class="space-y-2 text-gray-300">
                          <li><a href="#" class="hover:text-white transition-colors">Buy a Home</a></li>
                          <li><a href="#" class="hover:text-white transition-colors">Rent a Home</a></li>
                          <li><a href="#" class="hover:text-white transition-colors">Price Estimates</a></li>
                          <li><a href="#" class="hover:text-white transition-colors">Neighborhood Guide</a></li>
                      </ul>
                  </div>
                  <div>
                      <h4 class="font-semibold mb-4">For Sellers</h4>
                      <ul class="space-y-2 text-gray-300">
                          <li><a href="#" class="hover:text-white transition-colors">Sell Your Home</a></li>
                          <li><a href="#" class="hover:text-white transition-colors">List Your Property</a></li>
                          <li><a href="#" class="hover:text-white transition-colors">Agent Directory</a></li>
                          <li><a href="#" class="hover:text-white transition-colors">Market Reports</a></li>
                      </ul>
                  </div>
                  <div>
                      <h4 class="font-semibold mb-4">Support</h4>
                      <ul class="space-y-2 text-gray-300">
                          <li><a href="#" class="hover:text-white transition-colors">Help Center</a></li>
                          <li><a href="#" class="hover:text-white transition-colors">Contact Us</a></li>
                          <li><a href="#" class="hover:text-white transition-colors">Terms of Service</a></li>
                          <li><a href="#" class="hover:text-white transition-colors">Privacy Policy</a></li>
                      </ul>
                  </div>
              </div>
              <div class="border-t border-gray-800 mt-8 pt-8 text-center text-gray-300">
                  <p>&copy; 2024 Takussan. All rights reserved.</p>
              </div>
          </div>
      </footer>
  `,
  styles: []
})
export class Footer {
  readonly Twitter = Twitter;
  readonly Facebook = Facebook;
}
