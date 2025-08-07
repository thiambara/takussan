import {Component, Input} from '@angular/core';
import {CommonModule} from '@angular/common';

export interface StatCardData {
  id: string;
  title: string;
  value: string;
  change: number;
  changeType: 'increase' | 'decrease' | 'neutral';
  icon: string;
  color: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'indigo';
}

@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 border border-slate-200 dark:border-slate-700">
      <div class="flex items-center justify-between">
        <div class="flex-1">
          <p class="text-sm font-medium text-slate-600 dark:text-slate-400">{{ data.title }}</p>
          <p class="text-3xl font-bold text-slate-900 dark:text-white mt-2">{{ data.value }}</p>
          <div class="flex items-center mt-2">
            <div [class]="changeIndicatorClasses">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path 
                  stroke-linecap="round" 
                  stroke-linejoin="round" 
                  stroke-width="2" 
                  [attr.d]="changeIconPath"
                />
              </svg>
              <span class="text-sm font-medium ml-1">{{ Math.abs(data.change) }}%</span>
            </div>
            <span class="text-sm text-slate-500 dark:text-slate-400 ml-2">vs last month</span>
          </div>
        </div>
        <div [class]="iconContainerClasses">
          <div class="w-8 h-8" [innerHTML]="getIcon(data.icon)"></div>
        </div>
      </div>
    </div>
  `
})
export class StatCardComponent {
  @Input() data!: StatCardData;

  Math = Math;

  get changeIndicatorClasses(): string {
    const baseClasses = ['flex', 'items-center'];
    
    if (this.data.changeType === 'increase') {
      baseClasses.push('text-green-600', 'dark:text-green-400');
    } else if (this.data.changeType === 'decrease') {
      baseClasses.push('text-red-600', 'dark:text-red-400');
    } else {
      baseClasses.push('text-slate-600', 'dark:text-slate-400');
    }
    
    return baseClasses.join(' ');
  }

  get changeIconPath(): string {
    if (this.data.changeType === 'increase') {
      return 'M7 14l3-3 3 3m-6 0h6m-6 0V9a2 2 0 012-2h2a2 2 0 012 2v5';
    } else if (this.data.changeType === 'decrease') {
      return 'M17 10l-3 3-3-3m6 0h-6m6 0v5a2 2 0 01-2 2h-2a2 2 0 01-2-2v-5';
    } else {
      return 'M5 12h14';
    }
  }

  get iconContainerClasses(): string {
    const baseClasses = ['flex', 'items-center', 'justify-center', 'w-12', 'h-12', 'rounded-lg'];
    
    const colorClasses = {
      blue: ['bg-blue-100', 'text-blue-600', 'dark:bg-blue-900/50', 'dark:text-blue-400'],
      green: ['bg-green-100', 'text-green-600', 'dark:bg-green-900/50', 'dark:text-green-400'],
      yellow: ['bg-yellow-100', 'text-yellow-600', 'dark:bg-yellow-900/50', 'dark:text-yellow-400'],
      red: ['bg-red-100', 'text-red-600', 'dark:bg-red-900/50', 'dark:text-red-400'],
      purple: ['bg-purple-100', 'text-purple-600', 'dark:bg-purple-900/50', 'dark:text-purple-400'],
      indigo: ['bg-indigo-100', 'text-indigo-600', 'dark:bg-indigo-900/50', 'dark:text-indigo-400']
    };

    return [...baseClasses, ...colorClasses[this.data.color]].join(' ');
  }

  getIcon(iconName: string): string {
    const icons: Record<string, string> = {
      'revenue': '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>',
      'orders': '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path></svg>',
      'customers': '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m3 5.197V9a3 3 0 00-6 0v2.25"></path></svg>',
      'performance': '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>',
      'growth': '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>',
      'conversion': '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>'
    };
    return icons[iconName] || icons['performance'];
  }
}
