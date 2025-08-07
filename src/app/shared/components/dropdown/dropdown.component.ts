import {Component, Input, Output, EventEmitter, signal, HostListener} from '@angular/core';
import {CommonModule} from '@angular/common';

export interface DropdownItem {
  id: string;
  label: string;
  icon?: string;
  disabled?: boolean;
  divider?: boolean;
  action?: string;
}

@Component({
  selector: 'app-dropdown',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="relative">
      <!-- Trigger -->
      <ng-content select="[slot=trigger]"></ng-content>
      
      <!-- Dropdown Menu -->
      <div 
        *ngIf="isOpen()" 
        [class]="dropdownClasses"
      >
        <div class="py-1">
          <!-- Header slot -->
          <div *ngIf="hasHeaderContent" class="px-4 py-2 border-b border-slate-200 dark:border-slate-700">
            <ng-content select="[slot=header]"></ng-content>
          </div>
          
          <!-- Body/Content slot -->
          <div [class]="bodyClasses">
            <ng-content></ng-content>
          </div>
          
          <!-- Items from array -->
          <ng-container *ngFor="let item of items; trackBy: trackByFn">
            <hr *ngIf="item.divider" class="border-slate-200 dark:border-slate-700">
            <button
              *ngIf="!item.divider"
              type="button"
              [disabled]="item.disabled"
              (click)="onItemClick(item)"
              [class]="itemClasses"
              [class.opacity-50]="item.disabled"
              [class.cursor-not-allowed]="item.disabled"
            >
              <svg 
                *ngIf="item.icon" 
                class="mr-3 h-4 w-4" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  stroke-linecap="round" 
                  stroke-linejoin="round" 
                  stroke-width="2" 
                  [attr.d]="getIconPath(item.icon)"
                ></path>
              </svg>
              {{ item.label }}
            </button>
          </ng-container>
        </div>
      </div>
    </div>
  `
})
export class DropdownComponent {
  @Input() items: DropdownItem[] = [];
  @Input() position: 'left' | 'right' = 'right';
  @Input() width: 'sm' | 'md' | 'lg' | 'xl' = 'md';
  @Input() maxHeight = '64';
  @Input() hasHeaderContent = false;
  @Input() scrollable = false;
  
  @Output() itemClick = new EventEmitter<DropdownItem>();
  @Output() openChange = new EventEmitter<boolean>();
  
  isOpen = signal(false);

  open(): void {
    this.isOpen.set(true);
    this.openChange.emit(true);
  }

  close(): void {
    this.isOpen.set(false);
    this.openChange.emit(false);
  }

  toggle(): void {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  onItemClick(item: DropdownItem): void {
    if (!item.disabled) {
      this.itemClick.emit(item);
      this.close();
    }
  }

  trackByFn(index: number, item: DropdownItem): string {
    return item.id;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    const target = event.target as Element;
    if (!target.closest('.relative')) {
      this.close();
    }
  }

  get dropdownClasses(): string {
    const baseClasses = [
      'absolute', 'mt-2', 'bg-white', 'dark:bg-slate-800', 
      'rounded-md', 'shadow-lg', 'ring-1', 'ring-black', 
      'ring-opacity-5', 'focus:outline-none', 'z-50'
    ];

    const positionClasses = {
      left: ['left-0'],
      right: ['right-0']
    };

    const widthClasses = {
      sm: ['w-48'],
      md: ['w-56'],
      lg: ['w-80'],
      xl: ['w-96']
    };

    return [...baseClasses, ...positionClasses[this.position], ...widthClasses[this.width]].join(' ');
  }

  get bodyClasses(): string {
    const classes = [];
    if (this.scrollable) {
      classes.push(`max-h-${this.maxHeight}`, 'overflow-y-auto');
    }
    return classes.join(' ');
  }

  get itemClasses(): string {
    return [
      'flex', 'items-center', 'w-full', 'px-4', 'py-2', 'text-sm', 
      'text-slate-700', 'dark:text-slate-300', 'hover:bg-slate-100', 
      'dark:hover:bg-slate-700', 'transition-colors', 'duration-200', 'text-left'
    ].join(' ');
  }

  getIconPath(iconName: string): string {
    const icons: Record<string, string> = {
      'profile': 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
      'settings': 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
      'logout': 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
      'notification': 'M15 17h5l-5-5-5 5h5zm0 0v-2a4 4 0 00-8 0v2',
      'check': 'M5 13l4 4L19 7'
    };
    return icons[iconName] || '';
  }
}
