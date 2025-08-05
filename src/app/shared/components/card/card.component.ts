import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div [class]="cardClasses">
      <!-- Header -->
      <div *ngIf="hasHeaderContent" [class]="headerClasses">
        <ng-content select="[slot=header]"></ng-content>
      </div>
      
      <!-- Body -->
      <div [class]="bodyClasses">
        <ng-content></ng-content>
      </div>
      
      <!-- Footer -->
      <div *ngIf="hasFooterContent" [class]="footerClasses">
        <ng-content select="[slot=footer]"></ng-content>
      </div>
    </div>
  `
})
export class CardComponent {
  @Input() shadow: 'none' | 'sm' | 'md' | 'lg' | 'xl' = 'md';
  @Input() padding: 'none' | 'sm' | 'md' | 'lg' = 'md';
  @Input() rounded: 'none' | 'sm' | 'md' | 'lg' | 'xl' = 'lg';
  @Input() border: boolean = true;
  @Input() hover: boolean = true;
  @Input() headerBg: string = 'bg-gray-50';
  @Input() headerPadding: 'none' | 'sm' | 'md' | 'lg' = 'md';

  // These would need to be implemented based on content projection detection
  hasHeaderContent: boolean = true; // Simplified for now
  hasFooterContent: boolean = false; // Simplified for now

  get cardClasses(): string {
    const baseClasses = ['bg-white', 'overflow-hidden'];
    
    // Shadow classes
    const shadowClasses = {
      none: [],
      sm: ['shadow-sm'],
      md: ['shadow-md'],
      lg: ['shadow-lg'],
      xl: ['shadow-xl']
    };

    // Rounded classes
    const roundedClasses = {
      none: [],
      sm: ['rounded-sm'],
      md: ['rounded-md'],
      lg: ['rounded-lg'],
      xl: ['rounded-xl']
    };

    // Border classes
    const borderClasses = this.border ? ['border', 'border-gray-200'] : [];

    // Hover classes
    const hoverClasses = this.hover ? ['hover:shadow-lg', 'transition-shadow', 'duration-300'] : [];

    return [
      ...baseClasses,
      ...shadowClasses[this.shadow],
      ...roundedClasses[this.rounded],
      ...borderClasses,
      ...hoverClasses
    ].join(' ');
  }

  get headerClasses(): string {
    const baseClasses = [this.headerBg];
    
    const paddingClasses = {
      none: [],
      sm: ['p-3'],
      md: ['p-4'],
      lg: ['p-6']
    };

    return [...baseClasses, ...paddingClasses[this.headerPadding]].join(' ');
  }

  get bodyClasses(): string {
    const paddingClasses = {
      none: [],
      sm: ['p-3'],
      md: ['p-4'],
      lg: ['p-6']
    };

    return paddingClasses[this.padding].join(' ');
  }

  get footerClasses(): string {
    const baseClasses = ['border-t', 'border-gray-200', 'bg-gray-50'];
    
    const paddingClasses = {
      none: [],
      sm: ['p-3'],
      md: ['p-4'],
      lg: ['p-6']
    };

    return [...baseClasses, ...paddingClasses[this.headerPadding]].join(' ');
  }
}
