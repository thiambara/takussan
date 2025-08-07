import {Component, Input} from '@angular/core';
import {CommonModule} from '@angular/common';

@Component({
  selector: 'app-avatar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div [class]="avatarClasses">
      <img 
        *ngIf="src && !imageError" 
        [src]="src" 
        [alt]="alt"
        (error)="onImageError()"
        class="w-full h-full object-cover"
      >
      <span 
        *ngIf="!src || imageError" 
        [class]="initialsClasses"
      >
        {{ initials }}
      </span>
    </div>
  `
})
export class AvatarComponent {
  @Input() src?: string;
  @Input() alt = '';
  @Input() name = '';
  @Input() size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' = 'md';
  @Input() variant: 'circle' | 'square' = 'circle';
  @Input() fallbackColor: 'slate' | 'blue' | 'green' | 'red' | 'yellow' = 'slate';
  
  imageError = false;

  onImageError(): void {
    this.imageError = true;
  }

  get initials(): string {
    if (!this.name) return '?';
    
    const names = this.name.trim().split(' ');
    if (names.length === 1) {
      return names[0].charAt(0).toUpperCase();
    }
    return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
  }

  get avatarClasses(): string {
    const baseClasses = ['flex', 'items-center', 'justify-center', 'overflow-hidden'];
    
    const sizeClasses = {
      xs: ['w-5', 'h-5'],
      sm: ['w-6', 'h-6'],
      md: ['w-8', 'h-8'],
      lg: ['w-10', 'h-10'],
      xl: ['w-12', 'h-12']
    };

    const shapeClasses = {
      circle: ['rounded-full'],
      square: ['rounded-md']
    };

    const colorClasses = {
      slate: ['bg-slate-300', 'dark:bg-slate-600'],
      blue: ['bg-blue-300', 'dark:bg-blue-600'],
      green: ['bg-green-300', 'dark:bg-green-600'],
      red: ['bg-red-300', 'dark:bg-red-600'],
      yellow: ['bg-yellow-300', 'dark:bg-yellow-600']
    };

    return [
      ...baseClasses,
      ...sizeClasses[this.size],
      ...shapeClasses[this.variant],
      ...(!this.src || this.imageError ? colorClasses[this.fallbackColor] : [])
    ].join(' ');
  }

  get initialsClasses(): string {
    const sizeClasses = {
      xs: ['text-xs'],
      sm: ['text-xs'],
      md: ['text-sm'],
      lg: ['text-base'],
      xl: ['text-lg']
    };

    return ['font-medium', 'text-slate-700', 'dark:text-slate-300', ...sizeClasses[this.size]].join(' ');
  }
}
