import {Component, EventEmitter, HostListener, Input, Output} from '@angular/core';
import {CommonModule} from '@angular/common';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
      <!-- Modal Backdrop -->
      <div
              *ngIf="visible"
              class="fixed inset-0 z-50 overflow-y-auto"
              (click)="onBackdropClick($event)"
      >
          <!-- Backdrop -->
          <div class="fixed inset-0 bg-black bg-opacity-50 transition-opacity"></div>

          <!-- Modal Container -->
          <div class="flex min-h-full items-center justify-center p-4">
              <!-- Modal Content -->
              <div
                      [class]="modalClasses"
                      (click)="$event.stopPropagation()"
                      role="dialog"
                      aria-modal="true"
              >
                  <!-- Header -->
                  <div *ngIf="showHeader" class="flex items-center justify-between p-4 border-b border-gray-200">
                      <div class="flex-1">
                          <ng-content select="[slot=header]"></ng-content>
                          <h3 *ngIf="!hasHeaderContent && title" class="text-lg font-semibold text-gray-900">
                              {{ title }}
                          </h3>
                      </div>
                      <button
                              *ngIf="closable"
                              (click)="close()"
                              class="ml-4 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md p-1"
                              type="button"
                      >
                          <i class="pi pi-times text-lg"></i>
                      </button>
                  </div>

                  <!-- Body -->
                  <div [class]="bodyClasses">
                      <ng-content></ng-content>
                  </div>

                  <!-- Footer -->
                  <div *ngIf="hasFooterContent"
                       class="flex items-center justify-end gap-2 p-4 border-t border-gray-200 bg-gray-50">
                      <ng-content select="[slot=footer]"></ng-content>
                  </div>
              </div>
          </div>
      </div>
  `
})
export class ModalComponent {
  @Input() visible: boolean = false;
  @Input() title?: string;
  @Input() closable: boolean = true;
  @Input() closeOnEscape: boolean = true;
  @Input() closeOnBackdrop: boolean = true;
  @Input() size: 'sm' | 'md' | 'lg' | 'xl' | 'full' = 'md';
  @Input() showHeader: boolean = true;

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() onClose = new EventEmitter<void>();

  // These would need to be implemented based on content projection detection
  hasHeaderContent: boolean = false; // Simplified for now
  hasFooterContent: boolean = false; // Simplified for now

  get modalClasses(): string {
    const baseClasses = [
      'relative',
      'bg-white',
      'rounded-lg',
      'shadow-xl',
      'transform',
      'transition-all',
      'max-h-[90vh]',
      'overflow-hidden',
      'flex',
      'flex-col'
    ];

    const sizeClasses = {
      sm: ['w-full', 'max-w-sm'],
      md: ['w-full', 'max-w-md'],
      lg: ['w-full', 'max-w-2xl'],
      xl: ['w-full', 'max-w-4xl'],
      full: ['w-full', 'max-w-7xl', 'mx-4']
    };

    return [...baseClasses, ...sizeClasses[this.size]].join(' ');
  }

  get bodyClasses(): string {
    return 'flex-1 overflow-y-auto p-4';
  }

  onBackdropClick(event: Event): void {
    if (this.closeOnBackdrop && event.target === event.currentTarget) {
      this.close();
    }
  }

  close(): void {
    this.visible = false;
    this.visibleChange.emit(false);
    this.onClose.emit();
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(_: KeyboardEvent): void {
    if (this.visible && this.closeOnEscape) {
      this.close();
    }
  }
}
