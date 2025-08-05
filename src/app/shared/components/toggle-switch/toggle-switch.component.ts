import { Component, Input, Output, EventEmitter, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-toggle-switch',
  standalone: true,
  imports: [CommonModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ToggleSwitchComponent),
      multi: true
    }
  ],
  template: `
    <label class="relative inline-flex items-center cursor-pointer" [class.opacity-50]="disabled">
      <input 
        type="checkbox" 
        [checked]="value"
        [disabled]="disabled"
        (change)="onToggle($event)"
        class="sr-only peer"
      >
      <div [class]="switchClasses"></div>
      <span *ngIf="label" [class]="labelClasses">{{ label }}</span>
    </label>
  `
})
export class ToggleSwitchComponent implements ControlValueAccessor {
  @Input() label?: string;
  @Input() disabled: boolean = false;
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
  @Input() color: 'blue' | 'green' | 'red' | 'yellow' | 'purple' = 'blue';

  @Output() change = new EventEmitter<boolean>();

  value: boolean = false;

  private onChange = (value: boolean) => {};
  private onTouched = () => {};

  get switchClasses(): string {
    const sizeClasses = {
      sm: ['w-9', 'h-5', 'after:h-4', 'after:w-4', 'after:top-[2px]', 'after:left-[2px]', 'peer-checked:after:translate-x-4'],
      md: ['w-11', 'h-6', 'after:h-5', 'after:w-5', 'after:top-[2px]', 'after:left-[2px]', 'peer-checked:after:translate-x-full'],
      lg: ['w-14', 'h-7', 'after:h-6', 'after:w-6', 'after:top-[2px]', 'after:left-[2px]', 'peer-checked:after:translate-x-7']
    };

    const colorClasses = {
      blue: 'peer-checked:bg-blue-600',
      green: 'peer-checked:bg-green-600',
      red: 'peer-checked:bg-red-600',
      yellow: 'peer-checked:bg-yellow-600',
      purple: 'peer-checked:bg-purple-600'
    };

    const baseClasses = [
      'bg-gray-200',
      'peer-focus:outline-none',
      'peer-focus:ring-4',
      'peer-focus:ring-blue-300',
      'rounded-full',
      'peer',
      'peer-checked:after:translate-x-full',
      'peer-checked:after:border-white',
      "after:content-['']",
      'after:absolute',
      'after:bg-white',
      'after:border-gray-300',
      'after:border',
      'after:rounded-full',
      'after:transition-all',
      colorClasses[this.color]
    ];

    return [...baseClasses, ...sizeClasses[this.size]].join(' ');
  }

  get labelClasses(): string {
    const sizeClasses = {
      sm: 'ml-2 text-sm',
      md: 'ml-3 text-sm',
      lg: 'ml-3 text-base'
    };

    return `font-medium text-gray-900 ${sizeClasses[this.size]}`;
  }

  onToggle(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.value = target.checked;
    this.onChange(this.value);
    this.onTouched();
    this.change.emit(this.value);
  }

  // ControlValueAccessor implementation
  writeValue(value: boolean): void {
    this.value = value || false;
  }

  registerOnChange(fn: (value: boolean) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }
}
