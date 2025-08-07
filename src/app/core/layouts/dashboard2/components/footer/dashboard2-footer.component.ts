import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../../../../../shared/components';

@Component({
  selector: 'app-dashboard2-footer',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <footer class="bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 px-4 sm:px-6 lg:px-8 py-8">
      <div class="max-w-7xl mx-auto">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
          
          <!-- Company Info -->
          <div class="col-span-1 md:col-span-2">
            <div class="flex items-center">
              <div class="w-8 h-8 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                <span class="text-white font-bold text-sm">D</span>
              </div>
              <span class="ml-2 text-xl font-semibold text-slate-900 dark:text-white">Dashboard</span>
            </div>
            <p class="mt-4 text-sm text-slate-600 dark:text-slate-400 max-w-md">
              A modern, responsive dashboard built with Angular and Tailwind CSS. 
              Designed for productivity and ease of use across all devices.
            </p>
            
            <!-- Social Links -->
            <div class="mt-6 flex space-x-4">
              <a 
                href="#" 
                class="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300 transition-colors duration-200"
                aria-label="Twitter"
              >
                <span class="sr-only">Twitter</span>
                <app-icon name="twitter" [size]="6" />
              </a>
              <a 
                href="#" 
                class="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300 transition-colors duration-200"
                aria-label="GitHub"
              >
                <span class="sr-only">GitHub</span>
                <app-icon name="github" [size]="6" />
              </a>
              <a 
                href="#" 
                class="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300 transition-colors duration-200"
                aria-label="LinkedIn"
              >
                <span class="sr-only">LinkedIn</span>
                <app-icon name="linkedin" [size]="6" />
              </a>
            </div>
          </div>

          <!-- Quick Links -->
          <div>
            <h3 class="text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wider">
              Quick Links
            </h3>
            <ul class="mt-4 space-y-3">
              <li>
                <a href="#" class="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors duration-200">
                  Dashboard
                </a>
              </li>
              <li>
                <a href="#" class="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors duration-200">
                  Analytics
                </a>
              </li>
              <li>
                <a href="#" class="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors duration-200">
                  Reports
                </a>
              </li>
              <li>
                <a href="#" class="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors duration-200">
                  Settings
                </a>
              </li>
            </ul>
          </div>

          <!-- Support -->
          <div>
            <h3 class="text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wider">
              Support
            </h3>
            <ul class="mt-4 space-y-3">
              <li>
                <a href="#" class="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors duration-200">
                  Help Center
                </a>
              </li>
              <li>
                <a href="#" class="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors duration-200">
                  Documentation
                </a>
              </li>
              <li>
                <a href="#" class="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors duration-200">
                  API Reference
                </a>
              </li>
              <li>
                <a href="#" class="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors duration-200">
                  Contact Support
                </a>
              </li>
            </ul>
          </div>
        </div>

        <!-- Bottom Footer -->
        <div class="mt-8 pt-8 border-t border-slate-200 dark:border-slate-700">
          <div class="flex flex-col md:flex-row md:items-center md:justify-between">
            <div class="flex items-center space-x-6">
              <p class="text-sm text-slate-500 dark:text-slate-400">
                {{ currentYear }} Dashboard. All rights reserved.
              </p>
              <div class="hidden md:flex items-center space-x-4">
                <a href="#" class="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors duration-200">
                  Privacy Policy
                </a>
                <span class="text-slate-300 dark:text-slate-600">•</span>
                <a href="#" class="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors duration-200">
                  Terms of Service
                </a>
                <span class="text-slate-300 dark:text-slate-600">•</span>
                <a href="#" class="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors duration-200">
                  Cookie Policy
                </a>
              </div>
            </div>
            
            <div class="mt-4 md:mt-0 flex items-center space-x-4">
              <div class="flex items-center space-x-2">
                <div class="w-2 h-2 bg-green-500 rounded-full"></div>
                <span class="text-sm text-slate-500 dark:text-slate-400">All systems operational</span>
              </div>
              <button
                type="button"
                (click)="scrollToTop()"
                class="inline-flex items-center px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-md transition-colors duration-200"
              >
                <app-icon name="chevron-up" [size]="5" />
                Back to top
              </button>
            </div>
          </div>

          <!-- Mobile Legal Links -->
          <div class="mt-4 md:hidden flex flex-wrap gap-4">
            <a href="#" class="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors duration-200">
              Privacy Policy
            </a>
            <a href="#" class="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors duration-200">
              Terms of Service
            </a>
            <a href="#" class="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors duration-200">
              Cookie Policy
            </a>
          </div>
        </div>
      </div>
    </footer>
  `
})
export class Dashboard2FooterComponent {
  currentYear = new Date().getFullYear();

  scrollToTop() {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }
}
