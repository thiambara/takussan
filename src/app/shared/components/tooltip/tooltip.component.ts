import { Component, Input, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

@Component({
  selector: 'app-tooltip',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="relative inline-block">
      <!-- Trigger Element -->
      <div 
        #trigger
        (mouseenter)="showTooltip()"
        (mouseleave)="hideTooltip()"
        (focus)="showTooltip()"
        (blur)="hideTooltip()"
        class="cursor-help"
      >
        <ng-content></ng-content>
      </div>

      <!-- Tooltip -->
      <div
        #tooltip
        *ngIf="visible"
        [class]="tooltipClasses"
        class="absolute z-50 px-3 py-2 text-sm text-white bg-gray-900 rounded-lg shadow-lg whitespace-nowrap animate-[fadeIn_0.2s_ease-in-out] pointer-events-none"
        role="tooltip"
      >
        {{ text }}
        
        <!-- Arrow -->
        <div [class]="arrowClasses" class="absolute w-2 h-2 bg-gray-900 transform rotate-45"></div>
      </div>
    </div>
  `
})
export class TooltipComponent implements OnInit, OnDestroy {
  @Input() text = '';
  @Input() position: TooltipPosition = 'top';
  @Input() delay = 300;

  @ViewChild('tooltip', { static: false }) tooltipElement?: ElementRef;
  @ViewChild('trigger', { static: false }) triggerElement?: ElementRef;

  visible = false;
  private showTimeout?: number;
  private hideTimeout?: number;

  ngOnInit() {
    // Component initialization
  }

  ngOnDestroy() {
    if (this.showTimeout) {
      clearTimeout(this.showTimeout);
    }
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
    }
  }

  showTooltip() {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = undefined;
    }

    this.showTimeout = window.setTimeout(() => {
      this.visible = true;
    }, this.delay);
  }

  hideTooltip() {
    if (this.showTimeout) {
      clearTimeout(this.showTimeout);
      this.showTimeout = undefined;
    }

    this.hideTimeout = window.setTimeout(() => {
      this.visible = false;
    }, 100);
  }

  get tooltipClasses(): string {
    const baseClasses = '';
    
    switch (this.position) {
      case 'top':
        return `${baseClasses} bottom-full left-1/2 transform -translate-x-1/2 mb-2`;
      case 'bottom':
        return `${baseClasses} top-full left-1/2 transform -translate-x-1/2 mt-2`;
      case 'left':
        return `${baseClasses} right-full top-1/2 transform -translate-y-1/2 mr-2`;
      case 'right':
        return `${baseClasses} left-full top-1/2 transform -translate-y-1/2 ml-2`;
      default:
        return `${baseClasses} bottom-full left-1/2 transform -translate-x-1/2 mb-2`;
    }
  }

  get arrowClasses(): string {
    switch (this.position) {
      case 'top':
        return 'top-full left-1/2 transform -translate-x-1/2 -mt-1';
      case 'bottom':
        return 'bottom-full left-1/2 transform -translate-x-1/2 -mb-1';
      case 'left':
        return 'left-full top-1/2 transform -translate-y-1/2 -ml-1';
      case 'right':
        return 'right-full top-1/2 transform -translate-y-1/2 -mr-1';
      default:
        return 'top-full left-1/2 transform -translate-x-1/2 -mt-1';
    }
  }
}
