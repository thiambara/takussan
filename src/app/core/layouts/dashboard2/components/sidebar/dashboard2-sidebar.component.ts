import {Component, EventEmitter, Input, Output} from '@angular/core';
import {CommonModule} from '@angular/common';
import {RouterModule} from '@angular/router';

export interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  route?: string;
  badge?: string;
  badgeColor?: 'blue' | 'red' | 'green' | 'yellow';
  children?: MenuItem[];
  expanded?: boolean;
}

@Component({
  selector: 'app-dashboard2-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
      <aside
              class="w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col h-screen transition-transform duration-300 ease-in-out -translate-x-full lg:translate-x-0"
              [class.translate-x-0]="isOpen"
              [class.-translate-x-full]="!isOpen"
              [class.lg:translate-x-0]="!isOpen"
              [class.hidden]="!isOpen"
              [class.md:flex]="!isOpen"
      >
          <!-- Sidebar Header -->
          <div class="flex items-center dark:bg-slate-800 shadow-sm justify-between h-16 px-4 border-b border-slate-200 flex-shrink-0 bg-white dark:border-slate-700">
              <div class="flex items-center">
                  <div class="w-8 h-8 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                      <span class="text-white font-bold text-sm">D</span>
                  </div>
                  <span class="ml-2 text-xl font-semibold text-slate-900 dark:text-white">Dashboard</span>
              </div>

              <!-- Close button for mobile -->
              <button
                      type="button"
                      (click)="toggle.emit()"
                      class="lg:hidden p-1 rounded-md text-slate-400 hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                  <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
              </button>
          </div>

          <!-- Navigation -->
          <nav class="flex-1 px-4 py-6 overflow-y-auto">
              <div class="space-y-2">
                  @for (item of menuItems; track item.id) {
                      <div>
                          @if (item.children && item.children.length > 0) {
                              <!-- Menu item with submenu -->
                              <button
                                      type="button"
                                      (click)="toggleSubmenu(item.id)"
                                      class="w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 {{item.expanded ? 'dark:bg-blue-900/50' : ''}}"
                                      [class.bg-blue-50]="item.expanded"
                                      [class.text-blue-700]="item.expanded"
                                      [class.dark:text-blue-300]="item.expanded"
                                      [class.text-slate-700]="!item.expanded"
                                      [class.dark:text-slate-300]="!item.expanded"
                                      [class.hover:bg-slate-50]="!item.expanded"
                                      [class.dark:hover:bg-slate-700]="!item.expanded"
                              >
                                  <div class="flex items-center">
                                      <div *ngIf="item.icon" class="w-5 h-5 mr-3"
                                           [innerHTML]="getIcon(item.icon)"></div>
                                      <span>{{ item.label }}</span>
                                      @if (item.badge) {
                                          <span class="ml-2 px-2 py-0.5 text-xs font-medium rounded-full"
                                                [ngClass]="getBadgeClasses(item.badgeColor || 'blue')">
                        {{ item.badge }}
                      </span>
                                      }
                                  </div>
                                  <svg
                                          class="w-4 h-4 transition-transform duration-200"
                                          [class.rotate-90]="item.expanded"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                  >
                                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                            d="M9 5l7 7-7 7"></path>
                                  </svg>
                              </button>

                              <!-- Submenu -->
                              @if (item.expanded) {
                                  <div class="mt-1 ml-8 space-y-1">
                                      @for (child of item.children; track child.id) {
                                          <a
                                                  [routerLink]="child.route"
                                                  routerLinkActive="bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                                                  class="block px-3 py-2 text-sm font-medium rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-200 transition-colors duration-200"
                                          >
                                              <div class="flex items-center justify-between">
                                                  <span>{{ child.label }}</span>
                                                  @if (child.badge) {
                                                      <span class="px-2 py-0.5 text-xs font-medium rounded-full"
                                                            [ngClass]="getBadgeClasses(child.badgeColor || 'blue')">
                              {{ child.badge }}
                            </span>
                                                  }
                                              </div>
                                          </a>
                                      }
                                  </div>
                              }
                          } @else {
                              <!-- Regular menu item -->
                              <a
                                      [routerLink]="item.route"
                                      routerLinkActive="bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                                      class="flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-200 transition-colors duration-200"
                              >
                                  <div class="flex items-center">
                                      <div *ngIf="item.icon" class="w-5 h-5 mr-3"
                                           [innerHTML]="getIcon(item.icon)"></div>
                                      <span>{{ item.label }}</span>
                                  </div>
                                  @if (item.badge) {
                                      <span class="px-2 py-0.5 text-xs font-medium rounded-full"
                                            [ngClass]="getBadgeClasses(item.badgeColor || 'blue')">
                      {{ item.badge }}
                    </span>
                                  }
                              </a>
                          }
                      </div>
                  }
              </div>
          </nav>

          <!-- Sidebar Footer / Quick Actions - Always at bottom -->
          <div class="px-4 py-6 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
              <div class="px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Quick Actions
              </div>
              <div class="mt-2 space-y-1">
                  <button
                          type="button"
                          class="w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors duration-200"
                  >
                      <svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                      </svg>
                      <span>New Item</span>
                  </button>
                  <button
                          type="button"
                          class="w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors duration-200"
                  >
                      <svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"></path>
                      </svg>
                      <span>Share</span>
                  </button>
              </div>
          </div>
      </aside>
  `
})
export class Dashboard2SidebarComponent {
  @Input() isOpen: boolean = false;
  @Output() toggle = new EventEmitter<void>();

  menuItems: MenuItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: 'dashboard',
      route: '/dashboard2/overview'
    },
    {
      id: 'analytics',
      label: 'Analytics',
      icon: 'analytics',
      route: '/dashboard2/analytics',
      badge: 'New',
      badgeColor: 'green'
    },
    {
      id: 'users',
      label: 'Users',
      icon: 'users',
      children: [
        {id: 'all-users', label: 'All Users', route: '/dashboard2/users'},
        {id: 'user-roles', label: 'User Roles', route: '/dashboard2/users/roles'},
        {id: 'user-permissions', label: 'Permissions', route: '/dashboard2/users/permissions'}
      ]
    },
    {
      id: 'projects',
      label: 'Projects',
      icon: 'projects',
      children: [
        {
          id: 'active-projects',
          label: 'Active Projects',
          route: '/dashboard2/projects/active',
          badge: '12',
          badgeColor: 'blue'
        },
        {id: 'completed-projects', label: 'Completed', route: '/dashboard2/projects/completed'},
        {id: 'archived-projects', label: 'Archived', route: '/dashboard2/projects/archived'}
      ]
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: 'reports',
      route: '/dashboard2/reports'
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: 'settings',
      children: [
        {id: 'general-settings', label: 'General', route: '/dashboard2/settings/general'},
        {id: 'security-settings', label: 'Security', route: '/dashboard2/settings/security'},
        {
          id: 'integrations',
          label: 'Integrations',
          route: '/dashboard2/settings/integrations',
          badge: '3',
          badgeColor: 'yellow'
        }
      ]
    },
    {
      id: 'help',
      label: 'Help & Support',
      icon: 'help',
      route: '/dashboard2/help'
    }
  ];

  toggleSubmenu(itemId: string) {
    const item = this.findMenuItem(itemId, this.menuItems);
    if (item) {
      item.expanded = !item.expanded;
    }
  }

  getIcon(iconName: string): string {
    const icons: { [key: string]: string } = {
      dashboard: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5a2 2 0 012-2h4a2 2 0 012 2v6H8V5z"></path></svg>`,
      analytics: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>`,
      users: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"></path></svg>`,
      projects: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>`,
      reports: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>`,
      settings: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>`,
      help: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`
    };
    return icons[iconName] || icons['dashboard'];
  }

  getBadgeClasses(color: string): string {
    const classes = {
      blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
      red: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
      green: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
      yellow: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'
    };
    return classes[color as keyof typeof classes] || classes.blue;
  }

  private findMenuItem(id: string, items: MenuItem[]): MenuItem | null {
    for (const item of items) {
      if (item.id === id) return item;
      if (item.children) {
        const found = this.findMenuItem(id, item.children);
        if (found) return item; // Return parent for expansion
      }
    }
    return null;
  }
}
