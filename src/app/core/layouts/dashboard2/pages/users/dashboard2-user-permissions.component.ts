import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';

@Component({
  selector: 'app-dashboard2-user-permissions',
  standalone: true,
  imports: [CommonModule],
  template: `
      <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-8 border border-slate-200 dark:border-slate-700">
          <div class="text-center">
              <svg class="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor"
                   viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.031 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
              </svg>
              <h3 class="mt-2 text-lg font-medium text-slate-900 dark:text-white">User Permissions</h3>
              <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Configure user permissions and access
                  control</p>
          </div>
      </div>
  `
})
export class Dashboard2UserPermissionsComponent {
}
