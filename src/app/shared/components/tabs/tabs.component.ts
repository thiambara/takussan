import { Component, Input, Output, EventEmitter, ContentChildren, QueryList, AfterContentInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-tab',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div [hidden]="!active" class="tab-content">
      <ng-content></ng-content>
    </div>
  `
})
export class TabComponent {
  @Input() label!: string;
  @Input() value: any;
  @Input() disabled: boolean = false;
  @Input() active: boolean = false;
}

@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="tabs-container">
      <!-- Tab Headers -->
      <div class="border-b border-gray-200">
        <nav class="-mb-px flex space-x-8" aria-label="Tabs">
          <button
            *ngFor="let tab of tabs; let i = index"
            (click)="selectTab(tab, i)"
            [class]="getTabClasses(tab)"
            [disabled]="tab.disabled"
            type="button"
          >
            {{ tab.label }}
          </button>
        </nav>
      </div>
      
      <!-- Tab Content -->
      <div class="tab-panels mt-4">
        <ng-content></ng-content>
      </div>
    </div>
  `
})
export class TabsComponent implements AfterContentInit {
  @Input() activeIndex: number = 0;
  @Output() activeIndexChange = new EventEmitter<number>();
  @Output() tabChange = new EventEmitter<{ index: number; tab: TabComponent }>();

  @ContentChildren(TabComponent) tabs!: QueryList<TabComponent>;

  ngAfterContentInit(): void {
    // Set initial active tab
    this.selectTabByIndex(this.activeIndex);
  }

  selectTab(tab: TabComponent, index: number): void {
    if (tab.disabled) return;

    // Deactivate all tabs
    this.tabs.forEach(t => t.active = false);
    
    // Activate selected tab
    tab.active = true;
    this.activeIndex = index;
    
    this.activeIndexChange.emit(index);
    this.tabChange.emit({ index, tab });
  }

  selectTabByIndex(index: number): void {
    const tabsArray = this.tabs.toArray();
    if (tabsArray[index] && !tabsArray[index].disabled) {
      this.selectTab(tabsArray[index], index);
    }
  }

  getTabClasses(tab: TabComponent): string {
    const baseClasses = [
      'whitespace-nowrap',
      'py-2',
      'px-1',
      'border-b-2',
      'font-medium',
      'text-sm',
      'transition-colors',
      'duration-200'
    ];

    if (tab.disabled) {
      return [...baseClasses, 'border-transparent', 'text-gray-400', 'cursor-not-allowed'].join(' ');
    }

    if (tab.active) {
      return [...baseClasses, 'border-blue-500', 'text-blue-600'].join(' ');
    }

    return [...baseClasses, 'border-transparent', 'text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300', 'cursor-pointer'].join(' ');
  }
}
