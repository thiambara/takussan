import {Component, EventEmitter, forwardRef, Input, Output} from '@angular/core';
import {CommonModule} from '@angular/common';
import {ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR} from '@angular/forms';

@Component({
  selector: 'app-search-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SearchInputComponent),
      multi: true
    }
  ],
  template: `
      <div class="relative">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
              </svg>
          </div>
          <input
                  [value]="value"
                  (input)="onInput($event)"
                  (blur)="onBlur()"
                  [placeholder]="placeholder"
                  [disabled]="disabled"
                  [class]="inputClasses"
                  type="text"
          />
          <button
                  *ngIf="value && clearable"
                  (click)="clearInput()"
                  class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors duration-200"
                  type="button"
          >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
          </button>
      </div>
  `
})
export class SearchInputComponent implements ControlValueAccessor {
  @Input() placeholder: string = 'Search...';
  @Input() disabled: boolean = false;
  @Input() clearable: boolean = true;
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
  @Input() debounceTime: number = 300;

  @Output() search = new EventEmitter<string>();
  @Output() clear = new EventEmitter<void>();

  value: string = '';
  private debounceTimer: any;

  get inputClasses(): string {
    const baseClasses = [
      'w-full',
      'border',
      'border-gray-300',
      'rounded-md',
      'focus:outline-none',
      'focus:ring-2',
      'focus:ring-blue-500',
      'focus:border-transparent',
      'disabled:bg-gray-50',
      'disabled:text-gray-500',
      'transition-colors',
      'duration-200'
    ];

    const sizeClasses = {
      sm: ['pl-8', 'pr-3', 'py-1', 'text-sm'],
      md: ['pl-10', 'pr-3', 'py-2', 'text-sm'],
      lg: ['pl-12', 'pr-4', 'py-3', 'text-base']
    };

    const clearablePadding = this.value && this.clearable ?
      (this.size === 'lg' ? 'pr-10' : 'pr-8') : '';

    return [
      ...baseClasses,
      ...sizeClasses[this.size],
      clearablePadding
    ].filter(Boolean).join(' ');
  }

  onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.value = target.value;
    this.onChange(this.value);

    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set new timer for debounced search
    this.debounceTimer = setTimeout(() => {
      this.search.emit(this.value);
    }, this.debounceTime);
  }

  onBlur(): void {
    this.onTouched();
  }

  clearInput(): void {
    this.value = '';
    this.onChange(this.value);
    this.search.emit(this.value);
    this.clear.emit();
  }

  // ControlValueAccessor implementation
  writeValue(value: string): void {
    this.value = value || '';
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  private onChange = (_: string) => {
  };

  private onTouched = () => {
  };
}
