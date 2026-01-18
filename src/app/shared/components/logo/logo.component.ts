import {Component, Input} from '@angular/core';
import {CommonModule} from '@angular/common';

@Component({
  selector: 'app-logo',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex items-center">
      <div [class]="logoClasses">
        <span class="text-white font-bold" [class]="textSizeClass">{{ logoText }}</span>
      </div>
      @if (showText) {
        <span
          [class]="titleClasses"
        >
          {{ title }}
        </span>
      }
    </div>
  `
})
export class LogoComponent {
  @Input() title = 'Dashboard';
  @Input() logoText = 'D';
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
  @Input() showText = true;
  @Input() variant: 'primary' | 'secondary' | 'gradient' = 'gradient';

  get logoClasses(): string {
    const baseClasses = ['rounded-lg', 'flex', 'items-center', 'justify-center'];

    const sizeClasses = {
      sm: ['w-6', 'h-6'],
      md: ['w-8', 'h-8'],
      lg: ['w-10', 'h-10']
    };

    const variantClasses = {
      primary: ['bg-blue-600'],
      secondary: ['bg-slate-600'],
      gradient: ['bg-gradient-to-r', 'from-blue-500', 'to-blue-600']
    };

    return [...baseClasses, ...sizeClasses[this.size], ...variantClasses[this.variant]].join(' ');
  }

  get textSizeClass(): string {
    const sizeClasses = {
      sm: 'text-xs',
      md: 'text-sm',
      lg: 'text-base'
    };
    return sizeClasses[this.size];
  }

  get titleClasses(): string {
    const sizeClasses = {
      sm: ['ml-1', 'text-lg'],
      md: ['ml-2', 'text-xl'],
      lg: ['ml-3', 'text-2xl']
    };

    return ['font-semibold', 'text-slate-900', 'dark:text-white', 'hidden', 'sm:block', ...sizeClasses[this.size]].join(' ');
  }
}
