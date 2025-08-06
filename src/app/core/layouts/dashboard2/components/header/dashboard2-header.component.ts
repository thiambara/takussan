import {Component, EventEmitter, Input, Output, signal} from '@angular/core';
import {CommonModule} from '@angular/common';
import {DashboardUser, NotificationItem} from '../../dashboard2.component';

@Component({
  selector: 'app-dashboard2-header',
  standalone: true,
  imports: [CommonModule],
  template: `
      <header class="bg-white dark:bg-slate-800 shadow-sm border-b border-slate-200 dark:border-slate-700">
          <div class="px-4 sm:px-6 lg:px-8">
              <div class="flex justify-between items-center h-16">

                  <!-- Left side - Mobile menu button and logo -->
                  <div class="flex items-center">
                      <!-- Mobile menu button -->
                      <button
                              type="button"
                              (click)="menuClick.emit()"
                              class="lg:hidden inline-flex items-center justify-center p-2 rounded-md text-slate-400 hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 transition-colors duration-200"
                              aria-expanded="false"
                      >
                          <span class="sr-only">Open main menu</span>
                          <!-- Hamburger icon -->
                          <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M4 6h16M4 12h16M4 18h16"/>
                          </svg>
                      </button>

                      <!-- Logo -->
                      <div class="flex-shrink-0 ml-4 lg:ml-0">
                          <div class="flex items-center">
                              <div class="w-8 h-8 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                                  <span class="text-white font-bold text-sm">D</span>
                              </div>
                              <span class="ml-2 text-xl font-semibold text-slate-900 dark:text-white hidden sm:block">Dashboard</span>
                          </div>
                      </div>
                  </div>

                  <!-- Right side - Search, notifications, and profile -->
                  <div class="flex items-center space-x-4">

                      <!-- Search (hidden on mobile) -->
                      <div class="hidden md:block relative">
                          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <svg class="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                              </svg>
                          </div>
                          <input
                                  type="search"
                                  placeholder="Search..."
                                  class="block w-64 pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md leading-5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors duration-200"
                          >
                      </div>

                      <!-- Notifications -->
                      <div class="relative">
                          <button
                                  type="button"
                                  (click)="toggleNotifications()"
                                  class="p-2 text-slate-400 hover:text-slate-500 dark:hover:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full transition-colors duration-200"
                                  [attr.aria-expanded]="isNotificationsOpen()"
                          >
                              <span class="sr-only">View notifications</span>
                              <div class="relative">
                                  <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                            d="M15 17h5l-5-5-5 5h5zm0 0v-2a4 4 0 00-8 0v2"/>
                                  </svg>
                                  @if (unreadCount > 0) {
                                      <span class="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium">
                      {{ unreadCount > 9 ? '9+' : unreadCount }}
                    </span>
                                  }
                              </div>
                          </button>

                          <!-- Notifications dropdown -->
                          @if (isNotificationsOpen()) {
                              <div class="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-800 rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
                                  <div class="py-1">
                                      <div class="px-4 py-2 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                                          <h3 class="text-sm font-medium text-slate-900 dark:text-white">
                                              Notifications</h3>
                                          @if (unreadCount > 0) {
                                              <button
                                                      type="button"
                                                      (click)="markAllAsRead()"
                                                      class="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                                              >
                                                  Mark all as read
                                              </button>
                                          }
                                      </div>

                                      <div class="max-h-64 overflow-y-auto">
                                          @for (notification of notifications; track notification.id) {
                                              <div
                                                      class=" {{ !notification.read ? 'dark:bg-blue-900/20' : '' }}px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer border-b border-slate-100 dark:border-slate-700 last:border-b-0"
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
                                              <div class="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                                                  <svg class="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600"
                                                       fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                      <path stroke-linecap="round" stroke-linejoin="round"
                                                            stroke-width="2"
                                                            d="M15 17h5l-5-5-5 5h5zm0 0v-2a4 4 0 00-8 0v2"/>
                                                  </svg>
                                                  <p class="mt-2 text-sm">No notifications</p>
                                              </div>
                                          }
                                      </div>
                                  </div>
                              </div>
                          }
                      </div>

                      <!-- Profile dropdown -->
                      <div class="relative">
                          <button
                                  type="button"
                                  (click)="toggleProfile()"
                                  class="flex items-center space-x-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full"
                                  [attr.aria-expanded]="isProfileOpen()"
                          >
                              <div class="w-8 h-8 bg-slate-300 dark:bg-slate-600 rounded-full flex items-center justify-center overflow-hidden">
                                  @if (user?.avatar) {
                                      <img class="w-8 h-8 rounded-full object-cover" [src]="user?.avatar ?? ''"
                                           [alt]="user?.name ?? ''">
                                  } @else {
                                      <span class="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {{ getUserInitials() }}
                    </span>
                                  }
                              </div>
                              <div class="hidden md:block text-left">
                                  <p class="text-sm font-medium text-slate-900 dark:text-white">{{ user?.name }}</p>
                                  <p class="text-xs text-slate-500 dark:text-slate-400">{{ user?.role }}</p>
                              </div>
                              <svg class="hidden md:block w-4 h-4 text-slate-400" fill="none" stroke="currentColor"
                                   viewBox="0 0 24 24">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M19 9l-7 7-7-7"></path>
                              </svg>
                          </button>

                          <!-- Profile dropdown menu -->
                          @if (isProfileOpen()) {
                              <div class="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
                                  <div class="py-1">
                                      <a href="#" (click)="onProfileAction('profile', $event)"
                                         class="flex items-center px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                                          <svg class="mr-3 h-4 w-4" fill="none" stroke="currentColor"
                                               viewBox="0 0 24 24">
                                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                                          </svg>
                                          Your Profile
                                      </a>
                                      <a href="#" (click)="onProfileAction('settings', $event)"
                                         class="flex items-center px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                                          <svg class="mr-3 h-4 w-4" fill="none" stroke="currentColor"
                                               viewBox="0 0 24 24">
                                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                          </svg>
                                          Settings
                                      </a>
                                      <div class="border-t border-slate-200 dark:border-slate-700"></div>
                                      <a href="#" (click)="onProfileAction('logout', $event)"
                                         class="flex items-center px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                                          <svg class="mr-3 h-4 w-4" fill="none" stroke="currentColor"
                                               viewBox="0 0 24 24">
                                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
                                          </svg>
                                          Sign out
                                      </a>
                                  </div>
                              </div>
                          }
                      </div>
                  </div>
              </div>
          </div>
      </header>
  `
})
export class Dashboard2HeaderComponent {
  @Input() user: DashboardUser | null = null;
  @Input() notifications: NotificationItem[] = [];
  @Input() unreadCount: number = 0;

  @Output() menuClick = new EventEmitter<void>();
  @Output() profileAction = new EventEmitter<string>();
  @Output() notificationAction = new EventEmitter<{ action: string; notificationId?: string }>();

  isNotificationsOpen = signal(false);
  isProfileOpen = signal(false);

  toggleNotifications() {
    this.isNotificationsOpen.update(isOpen => !isOpen);
    this.isProfileOpen.set(false);
  }

  toggleProfile() {
    this.isProfileOpen.update(isOpen => !isOpen);
    this.isNotificationsOpen.set(false);
  }

  getUserInitials(): string {
    if (!this.user?.name) return 'U';
    return this.user.name
      .split(' ')
      .map(name => name.charAt(0).toUpperCase())
      .join('')
      .substring(0, 2);
  }

  onProfileAction(action: string, event: Event) {
    event.preventDefault();
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
