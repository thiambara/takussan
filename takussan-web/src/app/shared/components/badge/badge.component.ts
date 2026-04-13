import {Component, Input} from '@angular/core';


export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary' | 'secondary';
export type BadgeSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-badge',
  standalone: true,
  imports: [],
  templateUrl: './badge.component.html',
})
export class BadgeComponent {
  @Input() label: string = '';
  @Input() variant: BadgeVariant = 'neutral';
  @Input() size: BadgeSize = 'md';
  @Input() icon: string = '';
  @Input() rounded: boolean = true;

  get classes(): string {
    const baseClasses = 'inline-flex items-center font-medium border transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';

    const sizeClasses = {
      sm: 'px-2 py-0.5 text-xs',
      md: 'px-2.5 py-0.5 text-sm',
      lg: 'px-3 py-1 text-base',
    };

    const variantClasses = {
      neutral: 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100',
      primary: 'border-transparent bg-blue-100 text-blue-700 hover:bg-blue-200',
      secondary: 'border-transparent bg-purple-100 text-purple-700 hover:bg-purple-200',
      success: 'border-transparent bg-green-100 text-green-700 hover:bg-green-200',
      warning: 'border-transparent bg-yellow-100 text-yellow-700 hover:bg-yellow-200',
      danger: 'border-transparent bg-red-100 text-red-700 hover:bg-red-200',
      info: 'border-transparent bg-sky-100 text-sky-700 hover:bg-sky-200',
    };

    const roundedClass = this.rounded ? 'rounded-full' : 'rounded-md';

    return `${baseClasses} ${sizeClasses[this.size]} ${variantClasses[this.variant]} ${roundedClass}`;
  }
}
