import {Component, EventEmitter, Input, Output} from '@angular/core';
import {CommonModule} from '@angular/common';
import {RouterModule} from '@angular/router';
import {
  IconComponent,
  LogoComponent,
  NavItemComponent,
  NavMenuItem
} from '../../../../../shared/components';

interface QuickAction {
  id: string;
  label: string;
  icon?: string;
}

@Component({
  selector: 'app-dashboard2-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, LogoComponent, NavItemComponent, IconComponent],
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
              <app-logo title="Dashboard" logoText="D" size="md" [showText]="true"/>

              <!-- Close button for mobile -->
              <button
                      (click)="toggle.emit()"
                      class="lg:hidden"
              >
                  <app-icon name="x-mark" [size]="6"/>
              </button>
          </div>

          <!-- Navigation -->
          <nav class="flex-1 px-4 py-6 overflow-y-auto">
              <div class="space-y-2">
                  <app-nav-item
                          *ngFor="let item of menuItems; trackBy: trackByFn"
                          [item]="item"
                          (itemClick)="onMenuItemClick($event)"
                          (toggleSubmenu)="toggleSubmenu($event)"
                  />
              </div>
          </nav>

          <!-- Sidebar Footer / Quick Actions -->
          <div class="px-4 py-6 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
              <h3 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                  Quick Actions
              </h3>

              <div class="space-y-2">
                  <button
                          *ngFor="let action of quickActions"
                          (click)="onQuickAction(action.id)"
                          class="w-full justify-start mb-2 inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed">
                      <div *ngIf="action.icon" class="w-4 h-4 mr-2" [innerHTML]="getIcon(action.icon)"></div>
                      {{ action.label }}
                  </button>
              </div>
          </div>
      </aside>
  `
})
export class Dashboard2SidebarComponent {
  @Input() isOpen = false;
  @Output() toggle = new EventEmitter<void>();

  menuItems: NavMenuItem[] = [
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

  quickActions: QuickAction[] = [
    {
      id: 'new-item',
      label: 'New Item',
      icon: 'plus'
    },
    {
      id: 'share',
      label: 'Share',
      icon: 'share'
    }
  ];

  toggleSubmenu(itemId: string) {
    const item = this.findMenuItem(itemId, this.menuItems);
    if (item) {
      item.expanded = !item.expanded;
    }
  }

  onMenuItemClick(event: any) {
    console.log('Menu item clicked:', event);
  }

  onQuickAction(actionId: string) {
    console.log('Quick action clicked:', actionId);
  }

  trackByFn(index: number, item: NavMenuItem) {
    return item.id;
  }

  getIcon(iconName: string): string {
    const iconMap: { [key: string]: string } = {
      'dashboard': 'squares-2x2',
      'analytics': 'chart-bar',
      'users': 'users',
      'projects': 'folder',
      'reports': 'document-chart-bar',
      'settings': 'cog-6-tooth',
      'help': 'question-mark-circle',
      'plus': 'plus',
      'share': 'share'
    };
    return iconMap[iconName] || 'squares-2x2';
  }

  private findMenuItem(id: string, items: NavMenuItem[]): NavMenuItem | null {
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
