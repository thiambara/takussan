import {Component, OnDestroy, OnInit, signal} from '@angular/core';
import {CommonModule} from '@angular/common';
import {RouterOutlet} from '@angular/router';
import {Subject} from 'rxjs';
import {Dashboard2HeaderComponent} from './components/header/dashboard2-header.component';
import {Dashboard2SidebarComponent} from './components/sidebar/dashboard2-sidebar.component';
import {Dashboard2FooterComponent} from './components/footer/dashboard2-footer.component';

export interface DashboardUser {
  name: string;
  email: string;
  avatar?: string;
  role: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  type: 'info' | 'warning' | 'success' | 'error';
}

@Component({
  selector: 'app-dashboard2',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    Dashboard2HeaderComponent,
    Dashboard2SidebarComponent,
    Dashboard2FooterComponent
  ],
  template: `
      <div class="min-h-screen bg-slate-50 dark:bg-slate-900">
          <!-- Mobile sidebar backdrop -->
          @if (isSidebarOpen()) {
              <div
                      class="fixed inset-0 bg-slate-900/50 z-50 lg:hidden"
                      (click)="closeSidebar()"
              ></div>
          }

          <!-- Sidebar -->
          <app-dashboard2-sidebar
                  [isOpen]="isSidebarOpen()"
                  (toggle)="toggleSidebar()"
                  class="fixed inset-y-0 left-0 z-50 lg:z-auto"
          />

          <!-- Fixed Header -->
          <app-dashboard2-header
                  [user]="currentUser"
                  [notifications]="notifications"
                  [unreadCount]="unreadNotificationsCount()"
                  (menuClick)="toggleSidebar()"
                  (profileAction)="onProfileAction($event)"
                  (notificationAction)="onNotificationAction($event)"
                  class="fixed top-0 right-0 left-0 lg:left-64 z-40 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700"
          />

          <!-- Main Layout -->
          <div class="lg:pl-64">
              <!-- Main Content with top padding to account for fixed header -->
              <main class="px-4 sm:px-6 lg:px-8 py-8 pt-20">
                  <!--          <app-dashboard2-main />-->

                  <!-- Router outlet for nested routes if needed -->
                  <router-outlet/>
              </main>

              <!-- Footer -->
              <app-dashboard2-footer/>
          </div>
      </div>
  `
})
export class Dashboard2Component implements OnInit, OnDestroy {
  isSidebarOpen = signal(false);
  currentUser: DashboardUser = {
    name: 'John Doe',
    email: 'john.doe@example.com',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    role: 'Administrator'
  };
  notifications: NotificationItem[] = [
    {
      id: '1',
      title: 'New user registered',
      message: 'A new user has registered for your service.',
      timestamp: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
      read: false,
      type: 'info'
    },
    {
      id: '2',
      title: 'Server maintenance',
      message: 'Scheduled maintenance will begin at 2:00 AM UTC.',
      timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
      read: false,
      type: 'warning'
    },
    {
      id: '3',
      title: 'Payment received',
      message: 'Payment of $299.00 has been successfully processed.',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      read: true,
      type: 'success'
    }
  ];
  private destroy$ = new Subject<void>();

  ngOnInit() {
    // Initialize any data or subscriptions
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleSidebar() {
    console.log('Text');
    this.isSidebarOpen.update(isOpen => !isOpen);
    console.log(this.isSidebarOpen());
  }

  closeSidebar() {
    this.isSidebarOpen.set(false);
  }

  unreadNotificationsCount() {
    return this.notifications.filter(n => !n.read).length;
  }

  onProfileAction(action: string) {
    console.log('Profile action:', action);
    // Handle profile actions (view profile, settings, logout, etc.)
  }

  onNotificationAction(data: { action: string; notificationId?: string }) {
    console.log('Notification action:', data);

    if (data.action === 'markAsRead' && data.notificationId) {
      const notification = this.notifications.find(n => n.id === data.notificationId);
      if (notification) {
        notification.read = true;
      }
    } else if (data.action === 'markAllAsRead') {
      this.notifications.forEach(n => n.read = true);
    }
  }
}
