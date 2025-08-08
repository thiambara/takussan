import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {IconComponent} from '../../../../../shared/components';

@Component({
  selector: 'app-dashboard2-analytics',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
      <div class="space-y-6">
          <!-- Page Header -->
          <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 border border-slate-200 dark:border-slate-700">
              <div class="flex items-center justify-between">
                  <div>
                      <h1 class="text-2xl font-bold text-slate-900 dark:text-white">Analytics</h1>
                      <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Track your performance and key
                          metrics</p>
                  </div>
                  <div class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">
                      <span class="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                      New Feature
                  </div>
              </div>
          </div>

          <!-- Analytics Cards -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <!-- Traffic Analytics -->
              <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 border border-slate-200 dark:border-slate-700">
                  <h3 class="text-lg font-semibold text-slate-900 dark:text-white mb-4">Website Traffic</h3>
                  <div class="space-y-4">
                      <div class="flex items-center justify-between">
                          <div class="flex items-center">
                              <div class="w-3 h-3 bg-blue-500 rounded-full mr-3"></div>
                              <span class="text-sm text-slate-600 dark:text-slate-400">Organic Search</span>
                          </div>
                          <div class="text-sm font-medium text-slate-900 dark:text-white">42.3%</div>
                      </div>
                      <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                          <div class="bg-blue-500 h-2 rounded-full" style="width: 42.3%"></div>
                      </div>

                      <div class="flex items-center justify-between">
                          <div class="flex items-center">
                              <div class="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
                              <span class="text-sm text-slate-600 dark:text-slate-400">Direct</span>
                          </div>
                          <div class="text-sm font-medium text-slate-900 dark:text-white">28.7%</div>
                      </div>
                      <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                          <div class="bg-green-500 h-2 rounded-full" style="width: 28.7%"></div>
                      </div>

                      <div class="flex items-center justify-between">
                          <div class="flex items-center">
                              <div class="w-3 h-3 bg-yellow-500 rounded-full mr-3"></div>
                              <span class="text-sm text-slate-600 dark:text-slate-400">Social Media</span>
                          </div>
                          <div class="text-sm font-medium text-slate-900 dark:text-white">19.2%</div>
                      </div>
                      <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                          <div class="bg-yellow-500 h-2 rounded-full" style="width: 19.2%"></div>
                      </div>

                      <div class="flex items-center justify-between">
                          <div class="flex items-center">
                              <div class="w-3 h-3 bg-purple-500 rounded-full mr-3"></div>
                              <span class="text-sm text-slate-600 dark:text-slate-400">Email</span>
                          </div>
                          <div class="text-sm font-medium text-slate-900 dark:text-white">9.8%</div>
                      </div>
                      <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                          <div class="bg-purple-500 h-2 rounded-full" style="width: 9.8%"></div>
                      </div>
                  </div>
              </div>

              <!-- User Behavior -->
              <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 border border-slate-200 dark:border-slate-700">
                  <h3 class="text-lg font-semibold text-slate-900 dark:text-white mb-4">User Behavior</h3>
                  <div class="space-y-6">
                      <div>
                          <div class="flex justify-between text-sm mb-2">
                              <span class="text-slate-600 dark:text-slate-400">Average Session Duration</span>
                              <span class="font-medium text-slate-900 dark:text-white">3m 24s</span>
                          </div>
                          <div class="flex justify-between text-sm mb-2">
                              <span class="text-slate-600 dark:text-slate-400">Bounce Rate</span>
                              <span class="font-medium text-slate-900 dark:text-white">24.8%</span>
                          </div>
                          <div class="flex justify-between text-sm mb-2">
                              <span class="text-slate-600 dark:text-slate-400">Pages per Session</span>
                              <span class="font-medium text-slate-900 dark:text-white">4.2</span>
                          </div>
                      </div>

                      <div class="h-64 flex items-center justify-center bg-slate-50 dark:bg-slate-700 rounded-lg">
                          <div class="text-center">
                              <div class="w-16 h-16 mx-auto mb-4 bg-blue-100 dark:bg-blue-900/50 rounded-full flex items-center justify-center">
                                  <app-icon name="chart-bar" [size]="8" color="text-blue-600 dark:text-blue-400"/>
                              </div>
                              <p class="text-slate-500 dark:text-slate-400">Traffic Analytics Chart</p>
                          </div>
                      </div>
                  </div>
              </div>
          </div>

          <!-- Large Analytics Chart -->
          <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 border border-slate-200 dark:border-slate-700">
              <div class="flex items-center justify-between mb-6">
                  <h3 class="text-lg font-semibold text-slate-900 dark:text-white">Performance Metrics</h3>
                  <div class="flex space-x-2">
                      <button class="px-3 py-1 text-xs font-medium rounded-md bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
                          Last 7 days
                      </button>
                      <button class="px-3 py-1 text-xs font-medium rounded-md text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
                          Last 30 days
                      </button>
                      <button class="px-3 py-1 text-xs font-medium rounded-md text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
                          Last 90 days
                      </button>
                  </div>
              </div>

              <div class="h-64 flex items-center justify-center bg-slate-50 dark:bg-slate-700 rounded-lg">
                  <div class="text-center">
                      <div class="w-16 h-16 mx-auto mb-4 bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center">
                          <app-icon name="chart-pie" [size]="8" color="text-green-600 dark:text-green-400"/>
                      </div>
                      <p class="text-slate-500 dark:text-slate-400">Revenue Chart</p>
                  </div>
              </div>

              <div class="h-64 flex items-center justify-center bg-slate-50 dark:bg-slate-700 rounded-lg">
                  <div class="text-center">
                      <div class="w-16 h-16 mx-auto mb-4 bg-purple-100 dark:bg-purple-900/50 rounded-full flex items-center justify-center">
                          <app-icon name="presentation-chart-line" [size]="8"
                                    color="text-purple-600 dark:text-purple-400"/>
                      </div>
                      <p class="text-slate-500 dark:text-slate-400">Growth Trends</p>
                  </div>
              </div>
          </div>
      </div>
  `
})
export class Dashboard2AnalyticsComponent {
  constructor() {
  }
}
