import {Component, EventEmitter, Input, Output} from '@angular/core';
import {CommonModule} from '@angular/common';
import {RouterModule} from '@angular/router';
import {ButtonComponent} from '../button/button.component';
import {IconComponent} from '../icon/icon.component';

export interface NavMenuItem {
  id: string;
  label: string;
  route?: string;
  icon?: string;
  badge?: string;
  badgeColor?: 'blue' | 'red' | 'green' | 'yellow' | 'slate';
  children?: NavMenuItem[];
  expanded?: boolean;
  disabled?: boolean;
}

@Component({
  selector: 'app-nav-item',
  standalone: true,
  imports: [CommonModule, RouterModule, ButtonComponent, IconComponent],
  template: `
      <div>
          <!-- Parent menu item -->
          <ng-container *ngIf="hasChildren; else singleItem">
              <app-button
                      variant="secondary"
                      size="sm"
                      [fullWidth]="true"
                      (click)="toggle()"
                      [class]="parentButtonClasses"
              >
                  <div class="flex items-center justify-between w-full">
                      <div class="flex items-center space-x-3">
                          <app-icon *ngIf="item.icon" [name]="item.icon" [size]="5" />
                          <span class="font-medium text-slate-900 dark:text-slate-100">{{ item.label }}</span>
                          <span *ngIf="item.badge" [ngClass]="badgeClasses">
                            {{ item.badge }}
                          </span>
                      </div>
                      <app-icon 
                              [name]="item.expanded ? 'chevron-up' : 'chevron-down'" 
                              [size]="4" 
                              class="transition-transform duration-200 text-slate-400"
                              [class.rotate-90]="item.expanded"
                      />
                  </div>
              </app-button>

              <!-- Submenu -->
              <div *ngIf="item.expanded" class="mt-1 ml-8 space-y-1">
                  <app-nav-item
                          *ngFor="let child of item.children; trackBy: trackByFn"
                          [item]="child"
                          [level]="level + 1"
                          (itemClick)="onChildClick($event)"
                  />
              </div>
          </ng-container>

          <!-- Single menu item -->
          <ng-template #singleItem>
              <a
                      *ngIf="item.route"
                      [routerLink]="item.route"
                      routerLinkActive="bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                      [class]="linkClasses"
                      (click)="onClick()"
              >
                  <app-icon *ngIf="item.icon" [name]="item.icon" [size]="5" />
                  <span>{{ item.label }}</span>
                  <span
                          *ngIf="item.badge"
                          [class]="badgeClasses"
                  >
            {{ item.badge }}
          </span>
              </a>

              <button
                      *ngIf="!item.route"
                      type="button"
                      [disabled]="item.disabled"
                      (click)="onClick()"
                      [class]="buttonClasses"
              >
                  <app-icon *ngIf="item.icon" [name]="item.icon" [size]="5" />
                  <span>{{ item.label }}</span>
                  <span
                          *ngIf="item.badge"
                          [class]="badgeClasses"
                  >
            {{ item.badge }}
          </span>
              </button>
          </ng-template>
      </div>
  `
})
export class NavItemComponent {
  @Input() item!: NavMenuItem;
  @Input() level = 0;

  @Output() itemClick = new EventEmitter<NavMenuItem>();
  @Output() toggleSubmenu = new EventEmitter<string>();

  get hasChildren(): boolean {
    return !!(this.item.children && this.item.children.length > 0);
  }

  get parentButtonClasses(): string {
    const baseClasses = [
      'w-full', 'flex', 'items-center', 'justify-between',
      'px-3', 'py-2', 'text-sm', 'font-medium', 'rounded-lg',
      'transition-colors', 'duration-200', 'text-left'
    ];

    const expandedClasses = this.item.expanded
      ? ['bg-blue-50', 'text-blue-700', 'dark:bg-blue-900/50', 'dark:text-blue-300']
      : ['text-slate-700', 'dark:text-slate-300', 'hover:bg-slate-50', 'dark:hover:bg-slate-700'];

    return [...baseClasses, ...expandedClasses].join(' ');
  }

  get linkClasses(): string {
    return [
      'flex', 'items-center', 'px-3', 'py-2', 'text-sm', 'font-medium',
      'rounded-lg', 'text-slate-700', 'dark:text-slate-300',
      'hover:bg-slate-50', 'dark:hover:bg-slate-700',
      'hover:text-slate-900', 'dark:hover:text-slate-200',
      'transition-colors', 'duration-200'
    ].join(' ');
  }

  get buttonClasses(): string {
    const baseClasses = [
      'flex', 'items-center', 'w-full', 'px-3', 'py-2', 'text-sm',
      'font-medium', 'rounded-lg', 'text-slate-700', 'dark:text-slate-300',
      'hover:bg-slate-50', 'dark:hover:bg-slate-700',
      'hover:text-slate-900', 'dark:hover:text-slate-200',
      'transition-colors', 'duration-200', 'text-left'
    ];

    if (this.item.disabled) {
      baseClasses.push('opacity-50', 'cursor-not-allowed');
    }

    return baseClasses.join(' ');
  }

  get badgeClasses(): string {
    const color = this.item.badgeColor || 'blue';

    const colorClasses = {
      blue: ['bg-blue-100', 'text-blue-800', 'dark:bg-blue-900', 'dark:text-blue-300'],
      red: ['bg-red-100', 'text-red-800', 'dark:bg-red-900', 'dark:text-red-300'],
      green: ['bg-green-100', 'text-green-800', 'dark:bg-green-900', 'dark:text-green-300'],
      yellow: ['bg-yellow-100', 'text-yellow-800', 'dark:bg-yellow-900', 'dark:text-yellow-300'],
      slate: ['bg-slate-100', 'text-slate-800', 'dark:bg-slate-700', 'dark:text-slate-300']
    };

    return ['ml-2', 'px-2', 'py-0.5', 'text-xs', 'font-medium', 'rounded-full', ...colorClasses[color]].join(' ');
  }

  toggle(): void {
    this.toggleSubmenu.emit(this.item.id);
  }

  onClick(): void {
    this.itemClick.emit(this.item);
  }

  onChildClick(child: NavMenuItem): void {
    this.itemClick.emit(child);
  }

  trackByFn(index: number, item: NavMenuItem): string {
    return item.id;
  }
}
