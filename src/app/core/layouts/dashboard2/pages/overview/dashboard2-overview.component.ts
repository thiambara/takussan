import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {IconComponent} from '../../../../../shared/components';

@Component({
  selector: 'app-dashboard2-overview',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
      <div class="space-y-6">
          <!-- Page Header -->
          <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 border border-slate-200 dark:border-slate-700">
              <div class="flex items-center justify-between">
                  <div>
                      <h1 class="text-2xl font-bold text-slate-900 dark:text-white">Dashboard Overview</h1>
                      <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Get insights into your business
                          performance</p>
                  </div>
                  <div class="flex space-x-3">
                      <button class="inline-flex items-center px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors duration-200">
                          <app-icon name="arrow-down-tray" [size]="4" class="mr-2"/>
                          Export Data
                      </button>
                      <button class="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors duration-200">
                          <app-icon name="plus" [size]="4" class="mr-2"/>
                          Create New
                      </button>
                  </div>
              </div>
          </div>

          <!-- Quick Stats -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 border border-slate-200 dark:border-slate-700">
                  <div class="flex items-center">
                      <div class="flex-shrink-0">
                          <div class="w-8 h-8 bg-blue-100 dark:bg-blue-900/50 rounded-lg flex items-center justify-center">
                              <app-icon name="arrow-trending-up" [size]="5" color="text-blue-600 dark:text-blue-400"/>
                          </div>
                      </div>
                      <div class="ml-5 w-0 flex-1">
                          <dl>
                              <dt class="text-sm font-medium text-slate-500 dark:text-slate-400 truncate">Total Growth
                              </dt>
                              <dd class="flex items-baseline">
                                  <div class="text-2xl font-semibold text-slate-900 dark:text-white">+24.5%</div>
                                  <div class="ml-2 flex items-baseline text-sm font-semibold text-green-600">
                                      <app-icon name="arrow-up" [size]="3" class="mr-0.5"/>
                                      12%
                                  </div>
                              </dd>
                          </dl>
                      </div>
                  </div>
              </div>

              <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 border border-slate-200 dark:border-slate-700">
                  <div class="flex items-center">
                      <div class="flex-shrink-0">
                          <div class="w-8 h-8 bg-green-100 dark:bg-green-900/50 rounded-lg flex items-center justify-center">
                              <app-icon name="chart-bar-square" [size]="5"
                                        color="text-green-600 dark:text-green-400"/>
                          </div>
                      </div>
                      <div class="ml-5 w-0 flex-1">
                          <dl>
                              <dt class="text-sm font-medium text-slate-500 dark:text-slate-400 truncate">Revenue</dt>
                              <dd class="flex items-baseline">
                                  <div class="text-2xl font-semibold text-slate-900 dark:text-white">$89,247</div>
                                  <div class="ml-2 flex items-baseline text-sm font-semibold text-green-600">
                                      <app-icon name="arrow-up" [size]="3" class="mr-0.5"/>
                                      8.3%
                                  </div>
                              </dd>
                          </dl>
                      </div>
                  </div>
              </div>

              <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 border border-slate-200 dark:border-slate-700">
                  <div class="flex items-center">
                      <div class="flex-shrink-0">
                          <div class="w-8 h-8 bg-yellow-100 dark:bg-yellow-900/50 rounded-lg flex items-center justify-center">
                              <app-icon name="users" [size]="5" color="text-yellow-600 dark:text-yellow-400"/>
                          </div>
                      </div>
                      <div class="ml-5 w-0 flex-1">
                          <dl>
                              <dt class="text-sm font-medium text-slate-500 dark:text-slate-400 truncate">Active Users
                              </dt>
                              <dd class="flex items-baseline">
                                  <div class="text-2xl font-semibold text-slate-900 dark:text-white">3,247</div>
                                  <div class="ml-2 flex items-baseline text-sm font-semibold text-green-600">
                                      <app-icon name="arrow-up" [size]="3" class="mr-0.5"/>
                                      15.2%
                                  </div>
                              </dd>
                          </dl>
                      </div>
                  </div>
              </div>

              <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 border border-slate-200 dark:border-slate-700">
                  <div class="flex items-center">
                      <div class="flex-shrink-0">
                          <div class="w-8 h-8 bg-purple-100 dark:bg-purple-900/50 rounded-lg flex items-center justify-center">
                              <app-icon name="chart-pie" [size]="6" color="text-purple-600 dark:text-purple-400"/>
                          </div>
                      </div>
                      <div class="ml-5 w-0 flex-1">
                          <dl>
                              <dt class="text-sm font-medium text-slate-500 dark:text-slate-400 truncate">Conversion
                              </dt>
                              <dd class="flex items-baseline">
                                  <div class="text-2xl font-semibold text-slate-900 dark:text-white">4.57%</div>
                                  <div class="ml-2 flex items-baseline text-sm font-semibold text-red-600">
                                      <app-icon name="arrow-down" [size]="3" class="mr-0.5"/>
                                      2.1%
                                  </div>
                              </dd>
                          </dl>
                      </div>
                  </div>
              </div>
          </div>

          <!-- Additional Content Placeholder -->
          <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 border border-slate-200 dark:border-slate-700">
              <div class="text-center py-12">
                  <app-icon name="information-circle" [size]="12" color="text-slate-300 dark:text-slate-600"/>
                  <h3 class="mt-2 text-sm font-medium text-slate-900 dark:text-white">Dashboard Overview</h3>
                  <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">This is the main overview page of your
                      dashboard.</p>
              </div>
          </div>
      </div>
  `
})
export class Dashboard2OverviewComponent {
  constructor() {
  }
}
