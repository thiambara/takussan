import {Component, EventEmitter, Input, Output, signal} from '@angular/core';
import {CommonModule} from '@angular/common';
import {DashboardUser, NotificationItem} from '../../dashboard2.component';
import {
  AvatarComponent,
  DropdownComponent,
  DropdownItem,
  IconComponent,
  LogoComponent,
  SearchInputComponent
} from '../../../../../shared/components';

@Component({
  selector: 'app-dashboard2-header',
  standalone: true,
  imports: [
    CommonModule,
    LogoComponent,
    SearchInputComponent,
    DropdownComponent,
    AvatarComponent,
    IconComponent
  ],
  template: `
      <header class="bg-white dark:bg-slate-800 shadow-sm border-b border-slate-200 dark:border-slate-700">
          <div class="px-4 sm:px-6 lg:px-8">
              <div class="flex justify-between items-center h-16">

                  <!-- Left side - Mobile menu button and logo -->
                  <div class="flex items-center">
                      <!-- Mobile menu button -->
                      <button
                              (click)="menuClick.emit()"
                              class="lg:hidden mr-4 inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                              [attr.aria-expanded]="false">
                          <app-icon name="bars-3" [size]="6"/>
                      </button>

                      <!-- Logo -->
                      <app-logo title="Dashboard" logoText="D" size="md" [showText]="true"/>
                  </div>

                  <!-- Right side - Search, notifications, and profile -->
                  <div class="flex items-center space-x-4">

                      <!-- Search (hidden on mobile) -->
                      <div class="hidden md:block">
                          <app-search-input
                                  placeholder="Search..."
                                  size="md"
                                  [clearable]="true"
                                  class="w-64"
                          />
                      </div>

                      <!-- Notifications Dropdown -->
                      <app-dropdown
                              #notificationsDropdown
                              [items]="[]"
                              position="right"
                              width="lg"
                              [hasHeaderContent]="true"
                              [scrollable]="true"
                              maxHeight="64"
                      >
                          <!-- Notification trigger button -->
                          <button
                                  slot="trigger"
                                  type="button"
                                  (click)="toggleNotifications()"
                                  class="p-2 text-slate-400 hover:text-slate-500 dark:hover:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full transition-colors duration-200"
                                  [attr.aria-expanded]="isNotificationsOpen()"
                          >
                              <span class="sr-only">View notifications</span>
                              <div class="relative">
                                  <app-icon name="bell" [size]="6"/>
                                  @if (unreadCount > 0) {
                                      <span class="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium">
                                          {{ unreadCount > 9 ? '9+' : unreadCount }}
                                      </span>
                                  }
                              </div>
                          </button>

                          <!-- Notifications header -->
                          <div slot="header" class="flex justify-between items-center">
                              <h3 class="text-sm font-medium text-slate-900 dark:text-white">Notifications</h3>
                              @if (unreadCount > 0) {
                                  <button
                                          (click)="markAllAsRead()"
                                          class="text-xs inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed">
                                          Mark all as read
                                  </button>
                              }
                          </div>

                          <!-- Notifications list -->
                          <div class="space-y-0">
                              @for (notification of notifications; track notification.id) {
                                  <div
                                          class="{{!notification.read ? 'dark:bg-blue-900/20' : ''}} px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer border-b border-slate-100 dark:border-slate-700 last:border-b-0"
                                          [class.bg-blue-50]="!notification.read"
                                          (click)="markAsRead(notification.id)"
                                  >
                                      <div class="flex items-start">
                                          <div class="flex-shrink-0">
                                              <div class="w-2 h-2 rounded-full mt-2 mr-3"
                                                   [ngClass]="{
                                                     'bg-blue-500': notification.type === 'info',
                                                     'bg-yellow-500': notification.type === 'warning',
                                                     'bg-green-500': notification.type === 'success',
                                                     'bg-red-500': notification.type === 'error'
                                                   }">
                                              </div>
                                          </div>
                                          <div class="flex-1 min-w-0">
                                              <p class="text-sm font-medium text-slate-900 dark:text-white">
                                                  {{ notification.title }}
                                              </p>
                                              <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                                  {{ notification.message }}
                                              </p>
                                              <p class="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                                  {{ getRelativeTime(notification.timestamp) }}
                                              </p>
                                          </div>
                                      </div>
                                  </div>
                              } @empty {
                                  <div class="px-4 py-6 text-center">
                                      <p class="text-sm text-slate-500 dark:text-slate-400">No notifications</p>
                                  </div>
                              }
                          </div>
                      </app-dropdown>

                      <!-- Profile Dropdown -->
                      <app-dropdown
                              #profileDropdown
                              [items]="profileMenuItems"
                              position="right"
                              width="sm"
                              (itemClick)="onProfileAction($event.action || '', $event)"
                      >
                          <!-- Profile trigger button -->
                          <button
                                  slot="trigger"
                                  type="button"
                                  (click)="toggleProfile()"
                                  class="flex items-center space-x-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full"
                                  [attr.aria-expanded]="isProfileOpen()"
                          >
                              <app-avatar
                                      [src]="user?.avatar"
                                      [name]="user?.name || ''"
                                      [alt]="user?.name || ''"
                                      size="md"
                                      variant="circle"
                                      fallbackColor="slate"
                              />
                              <div class="flex flex-col">
                                  <p class="text-sm font-medium text-slate-900 dark:text-slate-100">{{ user?.name }}</p>
                                  <p class="text-xs text-slate-500 dark:text-slate-400">{{ user?.role }}</p>
                              </div>
                              <app-icon name="chevron-down" [size]="4" class="hidden md:block text-slate-400"/>
                          </button>
                      </app-dropdown>
                  </div>
              </div>
          </div>
      </header>
  `
})
export class Dashboard2HeaderComponent {
  @Input() user?: DashboardUser;
  @Input() notifications: NotificationItem[] = [];
  @Input() unreadCount = 0;

  @Output() menuClick = new EventEmitter<void>();
  @Output() profileAction = new EventEmitter<string>();
  @Output() notificationAction = new EventEmitter<any>();

  isNotificationsOpen = signal(false);
  isProfileOpen = signal(false);

  profileMenuItems: DropdownItem[] = [
    {id: 'profile', label: 'Your Profile', icon: 'profile', action: 'profile'},
    {id: 'settings', label: 'Settings', icon: 'settings', action: 'settings'},
    {id: 'divider', label: '', divider: true},
    {id: 'logout', label: 'Sign out', icon: 'logout', action: 'logout'}
  ];

  toggleNotifications() {
    this.isNotificationsOpen.update(isOpen => !isOpen);
    this.isProfileOpen.set(false);
  }

  toggleProfile() {
    this.isProfileOpen.update(isOpen => !isOpen);
    this.isNotificationsOpen.set(false);
  }

  onProfileAction(action: string, event?: any) {
    if (event?.preventDefault) {
      event.preventDefault();
    }
    this.profileAction.emit(action);
    this.isProfileOpen.set(false);
  }

  markAsRead(notificationId: string) {
    this.notificationAction.emit({action: 'markAsRead', notificationId});
  }

  markAllAsRead() {
    this.notificationAction.emit({action: 'markAllAsRead'});
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
