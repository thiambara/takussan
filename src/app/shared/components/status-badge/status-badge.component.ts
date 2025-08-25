import {Component, Input} from '@angular/core';
import {CommonModule} from '@angular/common';

export type StatusVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
      <span [class]="badgeClasses">
      <i *ngIf="icon" [class]="iconClasses"></i>
          @if (label) {
              {{ label }}
          } @else {
              <ng-content></ng-content>
          }
    </span>
  `
})
export class StatusBadgeComponent {
  @Input() label!: string;
  @Input() variant: StatusVariant = 'neutral';
  @Input() icon?: string;
  @Input() size: 'sm' | 'md' | 'lg' = 'md';

  get badgeClasses(): string {
    const baseClasses = [
      'inline-flex',
      'items-center',
      'font-semibold',
      'rounded-full'
    ];

    // Size classes
    const sizeClasses = {
      sm: ['px-2', 'py-0.5', 'text-xs'],
      md: ['px-2', 'py-1', 'text-xs'],
      lg: ['px-3', 'py-1', 'text-sm']
    };

    // Variant classes
    const variantClasses = {
      success: ['bg-green-100', 'text-green-800'],
      warning: ['bg-yellow-100', 'text-yellow-800'],
      danger: ['bg-red-100', 'text-red-800'],
      info: ['bg-blue-100', 'text-blue-800'],
      neutral: ['bg-gray-100', 'text-gray-800']
    };

    return [
      ...baseClasses,
      ...sizeClasses[this.size],
      ...variantClasses[this.variant]
    ].join(' ');
  }

  get iconClasses(): string {
    return `${this.icon} mr-1`;
  }
}
