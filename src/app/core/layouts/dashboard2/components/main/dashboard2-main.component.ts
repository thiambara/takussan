import {Component, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';

export interface StatCard {
  id: string;
  title: string;
  value: string;
  change: number;
  changeType: 'increase' | 'decrease' | 'neutral';
  icon: string;
  color: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'indigo';
}

export interface ActivityItem {
  id: string;
  type: 'user' | 'system' | 'sale' | 'error';
  title: string;
  description: string;
  timestamp: Date;
  user?: {
    name: string;
    avatar?: string;
  };
}

@Component({
  selector: 'app-dashboard2-main',
  standalone: true,
  imports: [CommonModule],
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
                      <button class="bg-white bg-opacity-20 hover:bg-opacity-30 px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200">
                          View Reports
                      </button>
                      <button class="bg-white text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200">
                          New Project
                      </button>
                  </div>
              </div>
          </div>

          <!-- Statistics Cards -->
          <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              @for (stat of statisticsData; track stat.id) {
                  <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 border border-slate-200 dark:border-slate-700">
                      <div class="flex items-center justify-between">
                          <div>
                              <p class="text-sm font-medium text-slate-600 dark:text-slate-400">{{ stat.title }}</p>
                              <p class="text-2xl font-bold text-slate-900 dark:text-white mt-2">{{ stat.value }}</p>
                          </div>
                          <div class="w-12 h-12 rounded-lg flex items-center justify-center"
                               [ngClass]="getStatIconClasses(stat.color)">
                              <div class="w-6 h-6" [innerHTML]="getStatIcon(stat.icon)"></div>
                          </div>
                      </div>
                      <div class="mt-4 flex items-center">
                          <div class="flex items-center text-sm"
                               [ngClass]="{
                     'text-green-600': stat.changeType === 'increase',
                     'text-red-600': stat.changeType === 'decrease',
                     'text-slate-600': stat.changeType === 'neutral'
                   }">
                              @if (stat.changeType === 'increase') {
                                  <svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                      <path fill-rule="evenodd"
                                            d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z"
                                            clip-rule="evenodd"></path>
                                  </svg>
                              } @else if (stat.changeType === 'decrease') {
                                  <svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                      <path fill-rule="evenodd"
                                            d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z"
                                            clip-rule="evenodd"></path>
                                  </svg>
                              } @else {
                                  <svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                      <path fill-rule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                                            clip-rule="evenodd"></path>
                                  </svg>
                              }
                              <span class="font-medium">{{ Math.abs(stat.change) }}%</span>
                          </div>
                          <span class="ml-2 text-sm text-slate-500 dark:text-slate-400">vs last month</span>
                      </div>
                  </div>
              }
          </div>

          <!-- Charts and Recent Activity Row -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

              <!-- Charts Section -->
              <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 border border-slate-200 dark:border-slate-700">
                  <div class="flex items-center justify-between mb-6">
                      <h2 class="text-lg font-semibold text-slate-900 dark:text-white">Analytics Overview</h2>
                      <div class="flex space-x-2">
                          <button class="px-3 py-1 text-xs font-medium rounded-md bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
                              7D
                          </button>
                          <button class="px-3 py-1 text-xs font-medium rounded-md text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
                              30D
                          </button>
                          <button class="px-3 py-1 text-xs font-medium rounded-md text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
                              90D
                          </button>
                      </div>
                  </div>

                  <!-- Chart Placeholder -->
                  <div class="h-64 bg-slate-50 dark:bg-slate-700 rounded-lg flex items-center justify-center">
                      <div class="text-center">
                          <svg class="mx-auto h-12 w-12 text-slate-400" fill="none" stroke="currentColor"
                               viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                          </svg>
                          <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">Chart visualization will appear
                              here</p>
                          <p class="text-xs text-slate-400 dark:text-slate-500">Connect your analytics service</p>
                      </div>
                  </div>
              </div>

              <!-- Recent Activity -->
              <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 border border-slate-200 dark:border-slate-700">
                  <div class="flex items-center justify-between mb-6">
                      <h2 class="text-lg font-semibold text-slate-900 dark:text-white">Recent Activity</h2>
                      <button class="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium">
                          View all
                      </button>
                  </div>

                  <div class="space-y-4">
                      @for (activity of recentActivity; track activity.id) {
                          <div class="flex items-start space-x-3">
                              <div class="flex-shrink-0">
                                  @if (activity.user?.avatar) {
                                      <img class="w-8 h-8 rounded-full object-cover" [src]="activity.user?.avatar ?? ''"
                                           [alt]="activity.user?.name ?? ''">
                                  } @else {
                                      <div class="w-8 h-8 rounded-full flex items-center justify-center"
                                           [ngClass]="getActivityIconClasses(activity.type)">
                                          <div class="w-4 h-4" [innerHTML]="getActivityIcon(activity.type)"></div>
                                      </div>
                                  }
                              </div>
                              <div class="flex-1 min-w-0">
                                  <p class="text-sm font-medium text-slate-900 dark:text-white">{{ activity.title }}</p>
                                  <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">{{ activity.description }}</p>
                                  <p class="text-xs text-slate-400 dark:text-slate-500 mt-1">{{ getRelativeTime(activity.timestamp) }}</p>
                              </div>
                          </div>
                      } @empty {
                          <div class="text-center py-8">
                              <svg class="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" fill="none"
                                   stroke="currentColor" viewBox="0 0 24 24">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                              </svg>
                              <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">No recent activity</p>
                          </div>
                      }
                  </div>
              </div>
          </div>

          <!-- Additional Charts Row -->
          <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">

              <!-- Performance Chart -->
              <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 border border-slate-200 dark:border-slate-700">
                  <h3 class="text-lg font-semibold text-slate-900 dark:text-white mb-4">Performance</h3>
                  <div class="h-48 bg-slate-50 dark:bg-slate-700 rounded-lg flex items-center justify-center">
                      <div class="text-center">
                          <div class="w-16 h-16 mx-auto bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center">
                              <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
                              </svg>
                          </div>
                          <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">Performance metrics</p>
                      </div>
                  </div>
              </div>

              <!-- Revenue Chart -->
              <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 border border-slate-200 dark:border-slate-700">
                  <h3 class="text-lg font-semibold text-slate-900 dark:text-white mb-4">Revenue</h3>
                  <div class="h-48 bg-slate-50 dark:bg-slate-700 rounded-lg flex items-center justify-center">
                      <div class="text-center">
                          <div class="w-16 h-16 mx-auto bg-blue-100 dark:bg-blue-900/50 rounded-full flex items-center justify-center">
                              <svg class="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"></path>
                              </svg>
                          </div>
                          <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">Revenue tracking</p>
                      </div>
                  </div>
              </div>

              <!-- User Engagement -->
              <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 border border-slate-200 dark:border-slate-700">
                  <h3 class="text-lg font-semibold text-slate-900 dark:text-white mb-4">User Engagement</h3>
                  <div class="h-48 bg-slate-50 dark:bg-slate-700 rounded-lg flex items-center justify-center">
                      <div class="text-center">
                          <div class="w-16 h-16 mx-auto bg-purple-100 dark:bg-purple-900/50 rounded-full flex items-center justify-center">
                              <svg class="w-8 h-8 text-purple-600" fill="none" stroke="currentColor"
                                   viewBox="0 0 24 24">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
                              </svg>
                          </div>
                          <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">Engagement stats</p>
                      </div>
                  </div>
              </div>
          </div>
      </div>
  `
})
export class Dashboard2MainComponent implements OnInit {

  statisticsData: StatCard[] = [
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

  recentActivity: ActivityItem[] = [
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
  protected readonly Math = Math;

  ngOnInit() {
    // Initialize any additional data or subscriptions
  }

  getStatIconClasses(color: string): string {
    const classes = {
      blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400',
      green: 'bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400',
      yellow: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/50 dark:text-yellow-400',
      red: 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400',
      purple: 'bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-400',
      indigo: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400'
    };
    return classes[color as keyof typeof classes] || classes.blue;
  }

  getStatIcon(iconName: string): string {
    const icons: { [key: string]: string } = {
      revenue: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"></path></svg>`,
      users: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"></path></svg>`,
      orders: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path></svg>`,
      conversion: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>`
    };
    return icons[iconName] || icons['revenue'];
  }

  getActivityIconClasses(type: string): string {
    const classes = {
      user: 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400',
      system: 'bg-gray-100 text-gray-600 dark:bg-gray-900/50 dark:text-gray-400',
      sale: 'bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400',
      error: 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400'
    };
    return classes[type as keyof typeof classes] || classes.system;
  }

  getActivityIcon(type: string): string {
    const icons: { [key: string]: string } = {
      user: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>`,
      system: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`,
      sale: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"></path></svg>`,
      error: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`
    };
    return icons[type] || icons['system'];
  }

  getRelativeTime(timestamp: Date): string {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - timestamp.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  }
}
