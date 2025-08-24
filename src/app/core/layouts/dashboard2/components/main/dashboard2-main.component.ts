import {Component, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {
  ActivityItemComponent,
  ActivityItemData,
  CardComponent,
  IconComponent,
  StatCardComponent,
  StatCardData
} from '../../../../../shared/components';

@Component({
  selector: 'app-dashboard2-main',
  standalone: true,
  imports: [
    CommonModule,
    StatCardComponent,
    ActivityItemComponent,
    CardComponent,
    IconComponent
  ],
  template: `
      <div class="space-y-6">
          <!-- Welcome Section -->
          <div class="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg shadow-sm p-6 text-white">
              <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                  <div>
                      <h1 class="text-2xl font-bold">Welcome back, John! 👋</h1>
                      <p class="mt-2 text-blue-100">Here's what's happening with your projects today.</p>
                  </div>
                  <div class="mt-4 sm:mt-0 flex space-x-3">
                      <button
                              class="bg-white bg-opacity-20 hover:bg-opacity-30 text-white border-white inline-flex items-center justify-center px-4 py-2 text-sm font-medium border rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white disabled:opacity-50 disabled:cursor-not-allowed">
                              View Reports
                      </button>
                      <button
                              class="bg-white text-blue-600 hover:bg-blue-50 border-white inline-flex items-center justify-center px-4 py-2 text-sm font-medium border rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed">
                              New Project
                      </button>
                  </div>
              </div>
          </div>

          <!-- Statistics Cards -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <app-stat-card
                      *ngFor="let stat of statisticsData; trackBy: trackByStatId"
                      [data]="stat"
              />
          </div>

          <!-- Charts Section -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <!-- Revenue Chart -->
              <app-card padding="lg">
                  <div slot="header" class="flex items-center justify-between">
                      <h3 class="text-lg font-semibold text-slate-900 dark:text-white">Revenue Overview</h3>
                      <button class="inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed">
                          View Details
                      </button>
                  </div>

                  <div class="h-64 flex items-center justify-center bg-slate-50 dark:bg-slate-700 rounded-lg">
                      <div class="text-center">
                          <div class="w-16 h-16 mx-auto mb-4 bg-blue-100 dark:bg-blue-900/50 rounded-full flex items-center justify-center">
                              <app-icon name="chart-bar-square" [size]="5" color="text-blue-600 dark:text-blue-400"/>
                          </div>
                          <p class="text-slate-500 dark:text-slate-400">Chart placeholder</p>
                      </div>
                  </div>
              </app-card>

              <!-- Traffic Sources -->
              <app-card padding="lg">
                  <div slot="header" class="flex items-center justify-between">
                      <h3 class="text-lg font-semibold text-slate-900 dark:text-white">Traffic Sources</h3>
                      <button class="inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed">
                          View All
                      </button>
                  </div>

                  <div class="space-y-4">
                      <div *ngFor="let source of trafficSources" class="flex items-center justify-between">
                          <div class="flex items-center">
                              <div [class]="'w-3 h-3 rounded-full mr-3 ' + source.color"></div>
                              <span class="text-sm font-medium text-slate-900 dark:text-white">{{ source.name }}</span>
                          </div>
                          <div class="text-right">
                              <span class="text-sm font-medium text-slate-900 dark:text-white">{{ source.value }}
                                  %</span>
                              <div class="w-16 h-2 bg-slate-200 dark:bg-slate-700 rounded-full mt-1">
                                  <div [class]="'h-2 rounded-full ' + source.color"
                                       [style.width.%]="source.value"></div>
                              </div>
                          </div>
                      </div>
                  </div>
              </app-card>
          </div>

          <!-- Recent Activity and Performance -->
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <!-- Recent Activity -->
              <div class="lg:col-span-2">
                  <app-card padding="lg">
                      <div slot="header" class="flex items-center justify-between">
                          <h3 class="text-lg font-semibold text-slate-900 dark:text-white">Recent Activity</h3>
                          <button class="inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed">
                              View All
                          </button>
                      </div>

                      <div class="space-y-0 divide-y divide-slate-100 dark:divide-slate-700">
                          <app-activity-item
                                  *ngFor="let activity of recentActivity; trackBy: trackByActivityId"
                                  [data]="activity"
                          />
                      </div>

                      <div *ngIf="recentActivity.length === 0" class="text-center py-8">
                          <div class="w-16 h-16 mx-auto mb-4 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center">
                              <app-icon name="clock" [size]="5" color="text-slate-400"/>
                          </div>
                          <p class="text-slate-500 dark:text-slate-400">No recent activity</p>
                      </div>
                  </app-card>
              </div>

              <!-- Team Performance -->
              <div>
                  <app-card padding="lg">
                      <div slot="header">
                          <h3 class="text-lg font-semibold text-slate-900 dark:text-white">Team Performance</h3>
                      </div>

                      <div class="space-y-4">
                          <div *ngFor="let member of teamPerformance" class="flex items-center justify-between">
                              <div class="flex items-center">
                                  <div class="w-8 h-8 bg-slate-300 dark:bg-slate-600 rounded-full flex items-center justify-center mr-3">
                                      <span class="text-xs font-medium text-slate-700 dark:text-slate-300">{{ getInitials(member.name) }}</span>
                                  </div>
                                  <div>
                                      <p class="text-sm font-medium text-slate-900 dark:text-white">{{ member.name }}</p>
                                      <p class="text-xs text-slate-500 dark:text-slate-400">{{ member.role }}</p>
                                  </div>
                              </div>
                              <div class="text-right">
                                  <div class="flex items-center text-sm">
                                      <span [class]="member.trend === 'up' ? 'text-green-600' : member.trend === 'down' ? 'text-red-600' : 'text-slate-600'">
                                          {{ member.score }}%
                                      </span>
                                      <app-icon
                                              [name]="getTrendIcon(member.trend)"
                                              [size]="4"
                                              class="ml-1"
                                              [color]="member.trend === 'up' ? 'text-green-600' : member.trend === 'down' ? 'text-red-600' : 'text-slate-600'"
                                      />
                                  </div>
                              </div>
                          </div>
                      </div>
                  </app-card>
              </div>
          </div>
      </div>
  `
})
export class Dashboard2MainComponent implements OnInit {

  statisticsData: StatCardData[] = [
    {
      id: '1',
      title: 'Total Revenue',
      value: '$54,239',
      change: 12.5,
      changeType: 'increase',
      icon: 'revenue',
      color: 'green'
    },
    {
      id: '2',
      title: 'Active Users',
      value: '2,847',
      change: 8.2,
      changeType: 'increase',
      icon: 'users',
      color: 'blue'
    },
    {
      id: '3',
      title: 'New Orders',
      value: '1,394',
      change: -3.1,
      changeType: 'decrease',
      icon: 'orders',
      color: 'yellow'
    },
    {
      id: '4',
      title: 'Conversion Rate',
      value: '3.24%',
      change: 2.4,
      changeType: 'increase',
      icon: 'conversion',
      color: 'purple'
    }
  ];

  recentActivity: ActivityItemData[] = [
    {
      id: '1',
      type: 'user',
      title: 'New user registered',
      description: 'Sarah Johnson signed up for premium plan',
      timestamp: new Date(Date.now() - 5 * 60 * 1000),
      user: {
        name: 'Sarah Johnson',
        avatar: 'https://images.unsplash.com/photo-1494790108755-2616b612b786?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80'
      }
    },
    {
      id: '2',
      type: 'sale',
      title: 'Payment received',
      description: 'Invoice #1234 paid successfully - $299.00',
      timestamp: new Date(Date.now() - 15 * 60 * 1000)
    },
    {
      id: '3',
      type: 'system',
      title: 'Database backup completed',
      description: 'Automated backup finished at 2:30 AM',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000)
    },
    {
      id: '4',
      type: 'user',
      title: 'Profile updated',
      description: 'Mike Chen updated his profile information',
      timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000),
      user: {
        name: 'Mike Chen',
        avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80'
      }
    }
  ];

  trafficSources = [
    {name: 'Direct', value: 40, color: 'bg-blue-500'},
    {name: 'Social Media', value: 30, color: 'bg-red-500'},
    {name: 'Email', value: 15, color: 'bg-yellow-500'},
    {name: 'Paid Advertising', value: 10, color: 'bg-green-500'},
    {name: 'Referral', value: 5, color: 'bg-purple-500'}
  ];

  teamPerformance: { name: string; role: string; score: number; trend: 'up' | 'down' | 'stable' }[] = [
    {name: 'John Doe', role: 'Developer', score: 85, trend: 'up'},
    {name: 'Jane Doe', role: 'Designer', score: 90, trend: 'up'},
    {name: 'Bob Smith', role: 'Manager', score: 78, trend: 'down'}
  ];

  ngOnInit() {
    // Initialize any additional data or subscriptions
  }

  trackByStatId(_: number, stat: StatCardData): string {
    return stat.id;
  }

  trackByActivityId(_: number, activity: ActivityItemData): string {
    return activity.id;
  }

  getInitials(name: string): string {
    const names = name.split(' ');
    return names[0].charAt(0).toUpperCase() + names[1].charAt(0).toUpperCase();
  }

  getTrendIcon(trend: 'up' | 'down' | 'stable'): string {
    const iconMap = {
      up: 'arrow-trending-up',
      down: 'arrow-trending-down',
      stable: 'minus'
    };
    return iconMap[trend];
  }
}
