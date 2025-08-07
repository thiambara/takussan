import {Component, Input} from '@angular/core';
import {CommonModule} from '@angular/common';
import {AvatarComponent} from '../avatar/avatar.component';

export interface ActivityItemData {
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
  selector: 'app-activity-item',
  standalone: true,
  imports: [CommonModule, AvatarComponent],
  template: `
    <div class="flex items-start space-x-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors duration-200">
      <!-- Activity indicator or user avatar -->
      <div class="flex-shrink-0">
        <app-avatar 
          *ngIf="data.user; else typeIndicator"
          [src]="data.user.avatar"
          [name]="data.user.name"
          [alt]="data.user.name"
          size="sm"
          variant="circle"
          fallbackColor="slate"
        />
        
        <ng-template #typeIndicator>
          <div [class]="typeIndicatorClasses">
            <div class="w-3 h-3" [innerHTML]="getTypeIcon(data.type)"></div>
          </div>
        </ng-template>
      </div>

      <!-- Activity content -->
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between">
          <p class="text-sm font-medium text-slate-900 dark:text-white">
            {{ data.title }}
          </p>
          <time class="text-xs text-slate-500 dark:text-slate-400">
            {{ getRelativeTime(data.timestamp) }}
          </time>
        </div>
        <p class="text-sm text-slate-600 dark:text-slate-400 mt-1">
          {{ data.description }}
        </p>
        <div *ngIf="data.user" class="text-xs text-slate-500 dark:text-slate-400 mt-1">
          by {{ data.user.name }}
        </div>
      </div>
    </div>
  `
})
export class ActivityItemComponent {
  @Input() data!: ActivityItemData;

  get typeIndicatorClasses(): string {
    const baseClasses = ['w-6', 'h-6', 'rounded-full', 'flex', 'items-center', 'justify-center'];
    
    const typeClasses = {
      user: ['bg-blue-100', 'text-blue-600', 'dark:bg-blue-900/50', 'dark:text-blue-400'],
      system: ['bg-slate-100', 'text-slate-600', 'dark:bg-slate-700', 'dark:text-slate-400'],
      sale: ['bg-green-100', 'text-green-600', 'dark:bg-green-900/50', 'dark:text-green-400'],
      error: ['bg-red-100', 'text-red-600', 'dark:bg-red-900/50', 'dark:text-red-400']
    };

    return [...baseClasses, ...typeClasses[this.data.type]].join(' ');
  }

  getTypeIcon(type: string): string {
    const icons: Record<string, string> = {
      user: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>',
      system: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>',
      sale: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>',
      error: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.34 16.5c-.77.833.192 2.5 1.732 2.5z"></path></svg>'
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
