import {Component, EventEmitter, Input, Output} from '@angular/core';
import {CommonModule} from '@angular/common';
import {RouterModule} from '@angular/router';

export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info';
export type ButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-button',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
      <button
              *ngIf="!routerLink"
              [type]="type"
              [disabled]="disabled || loading"
              [class]="buttonClasses"
              (click)="onClick.emit($event)"
      >
          <i *ngIf="loading" class="pi pi-spin pi-spinner mr-2"></i>
          <i *ngIf="icon && !loading" [class]="iconClasses"></i>
          <span *ngIf="label">{{ label }}</span>
          <ng-content></ng-content>
      </button>

      <a
              *ngIf="routerLink"
              [routerLink]="routerLink"
              [class]="buttonClasses"
      >
          <i *ngIf="icon" [class]="iconClasses"></i>
          <span *ngIf="label">{{ label }}</span>
          <ng-content></ng-content>
      </a>
  `
})
export class ButtonComponent {
  @Input() label?: string;
  @Input() icon?: string;
  @Input() iconPos: 'left' | 'right' = 'left';
  @Input() variant: ButtonVariant = 'primary';
  @Input() size: ButtonSize = 'md';
  @Input() disabled?: boolean = false;
  @Input() loading: boolean = false;
  @Input() outlined: boolean = false;
  @Input() text: boolean = false;
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  @Input() routerLink?: string | any[];
  @Input() fullWidth: boolean = false;

  @Output() onClick = new EventEmitter<Event>();

  get buttonClasses(): string {
    const baseClasses = [
      'inline-flex',
      'items-center',
      'justify-center',
      'font-medium',
      'rounded-md',
      'transition-colors',
      'duration-200',
      'focus:outline-none',
      'focus:ring-2',
      'focus:ring-offset-2',
      'disabled:opacity-50',
      'disabled:cursor-not-allowed'
    ];

    // Size classes
    const sizeClasses = {
      sm: ['px-3', 'py-1.5', 'text-sm'],
      md: ['px-4', 'py-2', 'text-sm'],
      lg: ['px-6', 'py-3', 'text-base']
    };

    // Variant classes
    const variantClasses = {
      primary: this.outlined
        ? ['text-blue-600', 'bg-white', 'border', 'border-blue-600', 'hover:bg-blue-50', 'focus:ring-blue-500']
        : this.text
          ? ['text-blue-600', 'hover:text-blue-700', 'hover:bg-blue-50']
          : ['text-white', 'bg-blue-600', 'border', 'border-blue-600', 'hover:bg-blue-700', 'focus:ring-blue-500'],

      secondary: this.outlined
        ? ['text-gray-600', 'bg-white', 'border', 'border-gray-300', 'hover:bg-gray-50', 'focus:ring-blue-500']
        : this.text
          ? ['text-gray-600', 'hover:text-gray-700', 'hover:bg-gray-50']
          : ['text-white', 'bg-gray-600', 'border', 'border-gray-600', 'hover:bg-gray-700', 'focus:ring-gray-500'],

      success: this.outlined
        ? ['text-green-600', 'bg-white', 'border', 'border-green-600', 'hover:bg-green-50', 'focus:ring-green-500']
        : this.text
          ? ['text-green-600', 'hover:text-green-700', 'hover:bg-green-50']
          : ['text-white', 'bg-green-600', 'border', 'border-green-600', 'hover:bg-green-700', 'focus:ring-green-500'],

      warning: this.outlined
        ? ['text-yellow-600', 'bg-white', 'border', 'border-yellow-600', 'hover:bg-yellow-50', 'focus:ring-yellow-500']
        : this.text
          ? ['text-yellow-600', 'hover:text-yellow-700', 'hover:bg-yellow-50']
          : ['text-white', 'bg-yellow-600', 'border', 'border-yellow-600', 'hover:bg-yellow-700', 'focus:ring-yellow-500'],

      danger: this.outlined
        ? ['text-red-600', 'bg-white', 'border', 'border-red-600', 'hover:bg-red-50', 'focus:ring-red-500']
        : this.text
          ? ['text-red-600', 'hover:text-red-700', 'hover:bg-red-50']
          : ['text-white', 'bg-red-600', 'border', 'border-red-600', 'hover:bg-red-700', 'focus:ring-red-500'],

      info: this.outlined
        ? ['text-blue-600', 'bg-white', 'border', 'border-blue-600', 'hover:bg-blue-50', 'focus:ring-blue-500']
        : this.text
          ? ['text-blue-600', 'hover:text-blue-700', 'hover:bg-blue-50']
          : ['text-white', 'bg-blue-600', 'border', 'border-blue-600', 'hover:bg-blue-700', 'focus:ring-blue-500']
    };

    const classes = [
      ...baseClasses,
      ...sizeClasses[this.size],
      ...variantClasses[this.variant]
    ];

    if (this.fullWidth) {
      classes.push('w-full');
    }

    if (this.iconPos === 'right' && this.icon && this.label) {
      classes.push('flex-row-reverse');
    }

    return classes.join(' ');
  }

  get iconClasses(): string {
    const classes = [this.icon!];

    if (this.label) {
      if (this.iconPos === 'left') {
        classes.push('mr-2');
      } else {
        classes.push('ml-2');
      }
    }

    return classes.join(' ');
  }
}
